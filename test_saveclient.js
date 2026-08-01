const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshHarness, remplirFormClient } = require('./harness');

describe('saveClient — verrou anti-double-réservation (audit §4.1, faille critique)', () => {
  test('refuse l\'enregistrement si le lot est déjà rattaché à un AUTRE souscripteur', async () => {
    const { fns, calls, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', prenoms: 'Awa', lot_id: 'l1' }];
    global.DATA.lots = [{ id: 'l1', numero: 'VL-01', statut: 'reserve', client_id: 'cA' }];
    global.APP.editingId = null; // nouveau souscripteur B

    remplirFormClient(dom, {
      'c-nom': 'Koffi', 'c-tel': '0700000000', 'c-commercial': 'comm1', 'c-lot': 'l1'
    });

    await fns.saveClient();

    assert.equal(global.DATA.clients.length, 1, 'aucun 2e souscripteur ne doit être créé');
    assert.equal(calls.dbPut.length, 0, 'aucune écriture en base');
    assert.ok(calls.toast.some(t => t.type === 'error' && /déjà rattaché/.test(t.msg)));
  });

  test('autorise la ré-édition du MÊME souscripteur propriétaire du lot (pas de faux positif)', async () => {
    const { fns, calls, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', prenoms: 'Awa', lot_id: 'l1', dossier: 'SS001' }];
    global.DATA.lots = [{ id: 'l1', numero: 'VL-01', statut: 'reserve', client_id: 'cA' }];
    global.APP.editingId = 'cA'; // on édite cA lui-même

    remplirFormClient(dom, {
      'c-nom': 'Kessié', 'c-tel': '0700000001', 'c-commercial': 'comm1', 'c-lot': 'l1',
      'c-montant-total': '1000000'
    });

    await fns.saveClient();

    assert.equal(calls.toast.some(t => t.type === 'error'), false, 'pas de faux positif sur le propriétaire réel');
    assert.equal(global.DATA.clients[0].tel, '0700000001', 'la modification a bien été appliquée');
  });

  test('bloque si ni commercial ni apporteur ne sont renseignés', async () => {
    const { fns, calls, dom } = freshHarness();
    remplirFormClient(dom, { 'c-nom': 'Koffi', 'c-tel': '0700000000', 'c-commercial': '', 'c-apporteur': '' });

    await fns.saveClient();

    assert.equal(global.DATA.clients.length, 0);
    assert.ok(calls.toast.some(t => /commercial OU un apporteur/.test(t.msg)));
  });

  test('bloque si nom ou téléphone manquant', async () => {
    const { fns, calls, dom } = freshHarness();
    remplirFormClient(dom, { 'c-nom': '', 'c-tel': '0700000000' });
    await fns.saveClient();
    assert.equal(global.DATA.clients.length, 0);
    assert.ok(calls.toast.some(t => /Nom et téléphone/.test(t.msg)));
  });

  test('création réussie : client persisté, lot réservé, logAudit "create", dossier auto-généré', async () => {
    const { fns, calls, dom } = freshHarness();
    global.DATA.lots = [{ id: 'l1', numero: 'VL-01', statut: 'disponible' }];
    global.APP.editingId = null;

    remplirFormClient(dom, {
      'c-nom': 'Koffi', 'c-tel': '0700000000', 'c-commercial': 'comm1',
      'c-lot': 'l1', 'c-montant-total': '1000000'
    });

    await fns.saveClient();

    assert.equal(global.DATA.clients.length, 1);
    assert.equal(global.DATA.clients[0].dossier, 'SS001');
    assert.equal(global.DATA.lots[0].client_id, global.DATA.clients[0].id);
    assert.ok(calls.dbPut.some(c => c.store === 'clients'));
    assert.equal(calls.renderClients, 1);
    assert.equal(calls.closeModal[0], 'modal-client');
    assert.equal(global.DATA.audit_log.some(e => e.entite === 'clients' && e.action === 'create'), true);
  });

  test('changement de lot en édition : ancien lot libéré (statut disponible, client_id null)', async () => {
    const { fns, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', lot_id: 'l1', dossier: 'SS001' }];
    global.DATA.lots = [
      { id: 'l1', numero: 'VL-01', statut: 'reserve', client_id: 'cA' },
      { id: 'l2', numero: 'VL-02', statut: 'disponible' }
    ];
    global.APP.editingId = 'cA';

    remplirFormClient(dom, { 'c-nom': 'Kessié', 'c-tel': '0700000000', 'c-commercial': 'comm1', 'c-lot': 'l2' });
    await fns.saveClient();

    assert.equal(global.DATA.lots[0].statut, 'disponible', 'ancien lot l1 libéré');
    assert.equal(global.DATA.lots[0].client_id, null);
    assert.equal(global.DATA.lots[1].client_id, 'cA', 'nouveau lot l2 rattaché');
  });

  test('anti double-clic : _savingClient bloque un second appel concurrent', async () => {
    const { fns, calls, dom } = freshHarness();
    global.APP._savingClient = true; // simule un enregistrement déjà en cours
    remplirFormClient(dom, { 'c-nom': 'Koffi', 'c-tel': '0700000000', 'c-commercial': 'comm1' });

    const res = await fns.saveClient();
    assert.equal(res, undefined);
    assert.equal(global.DATA.clients.length, 0, 'le second appel concurrent ne doit rien écrire');
  });
});
