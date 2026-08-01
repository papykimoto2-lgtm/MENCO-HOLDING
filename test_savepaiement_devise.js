const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshHarness, remplirFormClient } = require('./harness');

describe('savePaiement — création, édition, audit, statut du lot', () => {
  test('bloque si client, montant ou date manquant', async () => {
    const { fns, calls, dom } = freshHarness();
    remplirFormClient(dom, { 'v-client': '', 'v-montant': '', 'v-date': '' });
    await fns.savePaiement();
    assert.equal(global.DATA.versements.length, 0);
    assert.ok(calls.toast.some(t => t.type === 'error'));
  });

  test('création : versement persisté, écriture + commissions générées, audit "create"', async () => {
    const { fns, calls, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', lot_id: 'l1' }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    remplirFormClient(dom, { 'v-client': 'cA', 'v-montant': '500000', 'v-date': '2026-08-01', 'v-type': 'principal', 'v-mode': 'especes' });

    await fns.savePaiement();

    assert.equal(global.DATA.versements.length, 1);
    const v = global.DATA.versements[0];
    assert.equal(v.montant, 500000);
    assert.equal(v.client_id, 'cA');
    assert.match(v.ref, /^VRS-\d{4}-0001$/);
    assert.deepEqual(calls.ecrituresVersement, [v.id]);
    assert.deepEqual(calls.commissionsGenerees, [v.id]);
    assert.deepEqual(calls.recus, [v.id]);
    assert.equal(global.DATA.audit_log.some(e => e.entite === 'versements' && e.action === 'create' && e.entite_id === v.id), true);
  });

  test('création : déclenche majStatutLotClient (le lot peut passer réservé/vendu)', async () => {
    const { fns, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', lot_id: 'l1', montant_total: 1000000 }];
    global.DATA.lots = [{ id: 'l1', statut: 'disponible' }];
    remplirFormClient(dom, { 'v-client': 'cA', 'v-montant': '800000', 'v-date': '2026-08-01' });

    await fns.savePaiement();

    // seuil par défaut 70% de 1 000 000 = 700 000 ; 800 000 versé → doit passer "vendu"
    assert.equal(global.DATA.lots[0].statut, 'vendu');
  });

  test('édition : met à jour le versement existant, ré-impacte les commissions, log "update"', async () => {
    const { fns, calls, dom } = freshHarness();
    const vExist = { id: 'v1', client_id: 'cA', montant: 100000, date: '2026-07-01', type: 'principal', mode: 'especes', reference: '', mois: '', notes: '' };
    global.DATA.versements = [vExist];
    global.APP._editVersementId = 'v1';

    remplirFormClient(dom, { 'v-client': 'cA', 'v-montant': '150000', 'v-date': '2026-07-15', 'v-type': 'principal', 'v-mode': 'mobile_money' });
    await fns.savePaiement();

    assert.equal(global.DATA.versements[0].montant, 150000);
    assert.deepEqual(calls.commissionsReimpactees, ['v1']);
    assert.deepEqual(calls.ecrituresVersement, ['v1']);
    const upd = global.DATA.audit_log.find(e => e.entite === 'versements' && e.action === 'update');
    assert.ok(upd);
    assert.ok(upd.modifs.some(m => m.champ === 'montant' && m.avant === 100000 && m.apres === 150000));
    assert.equal(global.APP._editVersementId, null, 'le mode édition doit être réinitialisé après sauvegarde');
  });

  test('édition sans changement sensible ne journalise rien (anti-bruit)', async () => {
    const { fns, dom } = freshHarness();
    const vExist = { id: 'v1', client_id: 'cA', montant: 100000, date: '2026-07-01', type: 'principal', mode: 'especes', reference: '', mois: '', notes: 'ancienne note' };
    global.DATA.versements = [vExist];
    global.APP._editVersementId = 'v1';

    // Mêmes valeurs, sauf une note (non surveillée par CHAMPS_SENSIBLES.versements)
    remplirFormClient(dom, { 'v-client': 'cA', 'v-montant': '100000', 'v-date': '2026-07-01', 'v-type': 'principal', 'v-mode': 'especes', 'v-notes': 'nouvelle note' });
    await fns.savePaiement();

    assert.equal(global.DATA.audit_log.length, 0);
  });
});

describe('fcfa() — affichage multi-devise (§ demande "multi devise")', () => {
  test('par défaut (XOF) : format FCFA classique, pas de conversion', () => {
    const { fns } = freshHarness();
    global.DATA.params = {};
    assert.equal(fns.fcfa(1000000), (1000000).toLocaleString('fr-FR') + ' FCFA');
  });

  test('EUR : conversion au taux fixe UEMOA (655.957), équivalent FCFA rappelé', () => {
    const { fns } = freshHarness();
    global.DATA.params = { devise: 'EUR', taux_eur_xof: 655.957 };
    const res = fns.fcfa(655957);
    assert.match(res, /1\s?000,00\s?€/, 'doit afficher ~1000,00 €');
    assert.match(res, /655\s?957\s?FCFA/, 'doit rappeler le montant XOF réel');
  });

  test('USD sans taux configuré : repli explicite sur FCFA + message clair (pas de silence)', () => {
    const { fns } = freshHarness();
    global.DATA.params = { devise: 'USD' }; // taux_usd_xof absent
    const res = fns.fcfa(500000);
    assert.match(res, /FCFA/);
    assert.match(res, /non configuré/i);
  });

  test('USD avec taux configuré : conversion correcte', () => {
    const { fns } = freshHarness();
    global.DATA.params = { devise: 'USD', taux_usd_xof: 600 };
    const res = fns.fcfa(60000);
    assert.match(res, /100,00\s?\$/);
  });

  test('fcfaXOF() ignore toujours param-devise — garde-fou comptable', () => {
    const { fns } = freshHarness();
    global.DATA.params = { devise: 'EUR', taux_eur_xof: 655.957 };
    assert.equal(fns.fcfaXOF(655957), (655957).toLocaleString('fr-FR') + ' FCFA');
  });

  test('montant invalide/absent → 0, jamais NaN ni exception', () => {
    const { fns } = freshHarness();
    global.DATA.params = {};
    assert.equal(fns.fcfa(undefined), '0 FCFA');
    assert.equal(fns.fcfa('abc'), '0 FCFA');
  });
});
