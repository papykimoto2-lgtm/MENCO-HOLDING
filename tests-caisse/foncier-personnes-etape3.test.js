/* Foncier L17 étape 3 — le référentiel alimente protocoles et formulaires (CNI, famille, noms proposés) et s'enrichit à la saisie. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('protocole : CNI du chef et du président repris du référentiel ; famille déduite de la parcelle', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    DATA.personnes_fonciers = [{ id: 'pe1', nom: 'Kouamé Yao', nature: 'personne', cni: 'CI0099' }, { id: 'pe2', nom: 'Aka Paul', nature: 'personne', cni: 'CI0123' }];
    DATA.villages_fonciers = [{ id: 'v1', nom: 'Lahou', chef: 'KOUAME YAO', comite: { membres: [{ nom: 'Aka Paul', fonction: 'Président du CVGF' }] } }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', superficie: 1000 }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', nom: 'Famille Bédié', type: 'famille', parcelles: [{ parcelle_id: 'p1', ref: 'P1', part: 100 }] }];
    return fonDocPrerempli('protocoles', { village_id: 'v1', parcelle_id: 'p1' });
  });
  assert.equal(r.chef_cni, 'CI0099'); assert.equal(r.cvgf_cni, 'CI0123'); assert.equal(r.famille, 'Famille Bédié');
});

test('noms proposés pour une parcelle : propriétaires actuels, ayants droit, opération liée ; le référentiel complète', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Zadi Marc', nature: 'personne' }, { id: 'pe2', reference: 'PER-2', nom: 'Aka Paul', nature: 'personne' }];
    DATA.proprietaires_fonciers = [{ id: 'r1', parcelle_id: 'p1', proprietaire: 'Aka Paul' }, { id: 'r2', parcelle_id: 'p1', proprietaire: 'Ancien Owner', date_fin: '2020-01-01' }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', nom: 'Famille Bédié', parcelles: [{ parcelle_id: 'p1' }] }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', operation_id: 'op1' }]; DATA.af_operations = [{ id: 'op1', nom: 'DABRE', proprietaires: [{ nom: 'ODJE Clement' }, { nom: 'aka paul' }] }];
    fonPersonnesDatalistMaj('p1');
    return Array.from(document.getElementById('fon-pers-list').options).map(function (o) { return o.value + ' | ' + o.label; });
  });
  assert.deepEqual(r, ['Aka Paul | ↳ propriétaire actuel', 'Famille Bédié | ↳ ayant droit', 'ODJE Clement | ↳ opération DABRE', 'Zadi Marc | PER-1 · Personne']);
});

test('référentiel enrichi à la saisie : contact et CNI repris d\'un protocole', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    window.toast = function () {}; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; };
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Kouamé Yao', nature: 'personne' }];
    var rec = { chef_nom: 'Kouame Yao', chef_cni: 'CI777' }; await fonPersonnesAssurerFiche('protocoles', rec);
    return { cni: DATA.personnes_fonciers[0].cni, lien: rec.liens_personnes.chef_nom, nb: DATA.personnes_fonciers.length };
  });
  assert.equal(r.cni, 'CI777'); assert.equal(r.lien, 'pe1'); assert.equal(r.nb, 1);
});
