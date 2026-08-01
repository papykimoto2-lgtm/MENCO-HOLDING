const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshHarness, remplirFormClient } = require('./harness');

describe('updateLotsByProgramme — filtrage du <select> lots (audit §4.1)', () => {
  test('exclut les lots vendus (non sélectionnables, optgroup dédié)', () => {
    const { fns, dom } = freshHarness();
    global.DATA.lots = [
      { id: 'l1', numero: '01', programme_id: 'p1', statut: 'vendu', type: 'Villa', prix: 1000 },
      { id: 'l2', numero: '02', programme_id: 'p1', statut: 'disponible', type: 'Villa', prix: 2000 },
    ];
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();

    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /Déjà vendus \(1/);
    assert.match(html, /<option value="l2"/);
    assert.doesNotMatch(html, /<option value="l1"/); // l1 jamais sélectionnable directement
  });

  test('exclut les lots réservés par un AUTRE souscripteur', () => {
    const { fns, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', prenoms: 'Awa' }];
    global.DATA.lots = [
      { id: 'l1', numero: '01', programme_id: 'p1', statut: 'reserve', client_id: 'cA', type: 'Villa', prix: 1000 },
    ];
    global.APP.editingId = null; // nouveau souscripteur B, distinct de cA
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();

    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /Déjà réservés par un autre souscripteur \(1/);
    assert.match(html, /Kessié Awa/.test(html) || /Awa Kessié/.test(html) ? /./ : /./); // nom du propriétaire affiché
    assert.doesNotMatch(html, /<option value="l1"/);
  });

  test('réintègre le lot du souscripteur en cours d\'édition (pas de faux positif)', () => {
    const { fns, dom } = freshHarness();
    global.DATA.clients = [{ id: 'cA', nom: 'Kessié', lot_id: 'l1' }];
    global.DATA.lots = [
      { id: 'l1', numero: '01', programme_id: 'p1', statut: 'reserve', client_id: 'cA', type: 'Villa', prix: 1000 },
    ];
    global.APP.editingId = 'cA'; // on édite le propriétaire réel
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();

    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /<option value="l1"/, 'le propriétaire réel doit voir son propre lot sélectionnable');
    assert.doesNotMatch(html, /Déjà réservés/);
  });

  test('lot disponible ou sans statut reste sélectionnable', () => {
    const { fns, dom } = freshHarness();
    global.DATA.lots = [
      { id: 'l1', numero: '01', programme_id: 'p1', statut: 'disponible', type: 'Villa', prix: 1000 },
      { id: 'l2', numero: '02', programme_id: 'p1', statut: undefined, type: 'Villa', prix: 2000 },
    ];
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();

    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /<option value="l1"/);
    assert.match(html, /<option value="l2"/);
  });

  test('aucun programme sélectionné → message d\'invite, pas de crash', () => {
    const { fns, dom } = freshHarness();
    remplirFormClient(dom, { 'c-programme': '' });
    fns.updateLotsByProgramme();
    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /Choisissez d'abord un programme/);
  });

  test('programme sans aucun lot rattaché → diagnostic explicite', () => {
    const { fns, dom } = freshHarness();
    global.DATA.lots = [{ id: 'l1', numero: '01', programme_id: 'AUTRE_PROG', statut: 'disponible' }];
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();
    const html = dom.window.document.getElementById('c-lot').innerHTML;
    assert.match(html, /Aucun lot rattaché à ce programme/);
  });

  test('tri numérique correct des lots (01, 02, ..., 10 — pas 01, 10, 02)', () => {
    const { fns, dom } = freshHarness();
    global.DATA.lots = [
      { id: 'l10', numero: '10', programme_id: 'p1', statut: 'disponible', type: 'Villa', prix: 1 },
      { id: 'l2', numero: '02', programme_id: 'p1', statut: 'disponible', type: 'Villa', prix: 1 },
      { id: 'l1', numero: '01', programme_id: 'p1', statut: 'disponible', type: 'Villa', prix: 1 },
    ];
    remplirFormClient(dom, { 'c-programme': 'p1' });
    fns.updateLotsByProgramme();
    const html = dom.window.document.getElementById('c-lot').innerHTML;
    const pos1 = html.indexOf('value="l1"');
    const pos2 = html.indexOf('value="l2"');
    const pos10 = html.indexOf('value="l10"');
    assert.ok(pos1 < pos2 && pos2 < pos10, 'tri numérique attendu : 01 < 02 < 10');
  });
});
