/* Foncier L17 étape 4 — chaîne de propriété issue de l'opération, accès portail visible, vendeur proposé depuis la chaîne. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('opération → chaîne de propriété : parts égales modifiables, plafond 100 %, liens référentiel, pas de doublon', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var T = [], o = {};
    window.toast = function (m) { T.push(m); }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.syncToSupabase = function () {}; window.logAction = function () {}; window.fonRuralRender = function () {};
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = [{ id: 'x', parcelle_id: 'p1', proprietaire: 'Déjà Là', quote_part: 20, date_debut: '2020-01-01' }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1' }];
    DATA.af_operations = [{ id: 'op1', nom: 'DABRE', parcelle_id: 'p1', proprietaires: [{ id: '1', nom: 'AKA Paul', contact: '0102' }, { id: '2', nom: 'Famille Bédié' }, { id: '3', nom: 'déjà la' }, { id: '4', nom: 'ODJE Clément', code_acces_hash: 'h', code_acces_salt: 's' }] }];
    window._afOp = DATA.af_operations[0];
    fonChaineDepuisOperation();
    o.lignes = document.querySelectorAll('#fon-fiche-corps input[id^="fon-chaine-q"]').length; o.part = document.getElementById('fon-chaine-q0').value;   /* (100-20)/3 */
    document.getElementById('fon-chaine-q0').value = '50'; T.length = 0; await fonChaineValider(); o.refusPlafond = T.join(' ');   /* 50+26.66+26.66 > 80 */
    document.getElementById('fon-chaine-q0').value = '40'; document.getElementById('fon-chaine-q1').value = '20'; document.getElementById('fon-chaine-q2').value = '20'; await fonChaineValider();
    o.chaine = DATA.proprietaires_fonciers.filter(function (x) { return x.operation_id === 'op1'; }).map(function (x) { return x.proprietaire + ':' + x.quote_part + ':' + x.type_proprietaire; });
    o.liens = DATA.proprietaires_fonciers.filter(function (x) { return x.operation_id === 'op1'; }).every(function (x) { return x.liens_personnes && x.liens_personnes.proprietaire; });
    o.personnes = DATA.personnes_fonciers.length; fonChaineDepuisOperation(); o.restant = document.querySelectorAll('#fon-fiche-corps input[id^="fon-chaine-q"]').length;
    /* portail visible sur la fiche du référentiel */
    var odje = DATA.personnes_fonciers.filter(function (p) { return /ODJE/i.test(p.nom); })[0]; o.portail = odje ? fonPersonnePortail(odje.id) : 'absent';
    return o;
  });
  assert.equal(r.lignes, 3); assert.equal(r.part, '26.66'); assert.match(r.refusPlafond, /capacité restante 80/);
  assert.deepEqual(r.chaine, ['AKA Paul:40:personne', 'Famille Bédié:20:famille', 'ODJE Clément:20:personne']); assert.equal(r.liens, true); assert.equal(r.personnes, 3); assert.equal(r.restant, 0);
  assert.equal(r.portail, true);
});

test('parcelle : vendeur proposé depuis la chaîne quand un seul propriétaire actuel', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    document.body.insertAdjacentHTML('beforeend', '<input id="parc-vendeur"><input id="parc-cedant">');
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = [{ id: 'x', parcelle_id: 'p1', proprietaire: 'Aka Paul', quote_part: 100, date_debut: '2020-01-01' }]; DATA.parcelles = [{ id: 'p1' }];
    APP.editingId = 'p1'; var v = document.getElementById('parc-vendeur'); v.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); var a = v.value;
    v.value = 'Saisi'; v.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    return { propose: a, garde: v.value };
  });
  assert.equal(r.propose, 'Aka Paul'); assert.equal(r.garde, 'Saisi');
});
