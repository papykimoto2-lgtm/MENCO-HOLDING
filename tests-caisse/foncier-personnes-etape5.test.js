/* Foncier L17 étape 5 — correction de la fiche répercutée sur les saisies reliées (documents signés préservés), badge, contrôle de cohérence. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

const stub = () => {
  window.toast = function () {}; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
  window.syncToSupabase = function () {}; window.logAction = function () {}; window.fonRuralRender = function () {}; window.confirm = function () { return true; };
};

test('renommage : saisies reliées mises à jour, protocole signé intact, saisie non reliée intacte', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Kouame Yao', contact: '' }];
    DATA.villages_fonciers = [{ id: 'v1', nom: 'Lahou', chef: 'Kouame Yao', liens_personnes: { chef: 'pe1' } }];
    DATA.af_operations = [{ id: 'o1', nom: 'OP', proprietaires: [{ id: '1', nom: 'Kouame Yao', contact: '', liens_personnes: { nom: 'pe1' } }, { id: '2', nom: 'Kouame Yao' }] }];
    DATA.protocoles_purge_fonciers = [{ id: 'pt1', reference: 'PRT-1', statut: 'signe', chef_nom: 'Kouame Yao', liens_personnes: { chef_nom: 'pe1' } }, { id: 'pt2', reference: 'PRT-2', statut: 'brouillon', chef_nom: 'Kouame Yao', liens_personnes: { chef_nom: 'pe1' } }];
    DATA.parcelles = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = [];
    var avant = JSON.parse(JSON.stringify(DATA.personnes_fonciers[0])); var rec = Object.assign({}, avant, { nom: 'Kouamé Yao', contact: '0707' }); DATA.personnes_fonciers[0] = rec;
    await fonPersonnePropager(rec, avant);
    return { village: DATA.villages_fonciers[0].chef, opLie: DATA.af_operations[0].proprietaires[0].nom, opContact: DATA.af_operations[0].proprietaires[0].contact, opNonLie: DATA.af_operations[0].proprietaires[1].nom,
      signe: DATA.protocoles_purge_fonciers[0].chef_nom, brouillon: DATA.protocoles_purge_fonciers[1].chef_nom };
  }, stub.toString());
  assert.equal(r.village, 'Kouamé Yao'); assert.equal(r.opLie, 'Kouamé Yao'); assert.equal(r.opContact, '0707'); assert.equal(r.opNonLie, 'Kouame Yao');
  assert.equal(r.signe, 'Kouame Yao'); assert.equal(r.brouillon, 'Kouamé Yao');
});

test('badge et contrôle de cohérence : saisies non reliées signalées', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    DATA.personnes_fonciers = []; DATA.villages_fonciers = []; DATA.af_operations = [{ id: 'o1', nom: 'OP', proprietaires: [{ id: '1', nom: 'Aka Paul' }] }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', superficie: 1000, regime: 'urbain' }]; DATA.proprietaires_fonciers = [{ id: 'r1', parcelle_id: 'p1', proprietaire: 'Aka Paul', quote_part: 100, date_debut: '2020-01-01' }]; DATA.ayants_droit_fonciers = [];
    var avant = fonPersonnesNonRelieesNb(), coh = fonCoherenceAnalyser().filter(function (x) { return x.code === 'personne_non_reliee'; }).length;
    await fonPersonnesToutCreer();
    return { avant: avant, coh: coh, apres: fonPersonnesNonRelieesNb(), cohApres: fonCoherenceAnalyser().filter(function (x) { return x.code === 'personne_non_reliee'; }).length };
  }, stub.toString());
  assert.equal(r.avant, 2); assert.equal(r.coh, 1); assert.equal(r.apres, 0); assert.equal(r.cohApres, 0);
});
