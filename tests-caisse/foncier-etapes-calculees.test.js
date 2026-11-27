/* Foncier — étapes du dossier rural calculées depuis les fiches (enquête, bornage). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('fiche enquête ouverte + bornage réalisé : étapes actives terminées, autres inchangées', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    window.toast = function () {};
    var d = { id: 'd1', parcelle_id: 'p1', type_procedure: 'immatriculation_rurale',
      etapes: [{ code: 'rur_ouverture_enquete', statut: 'en_cours' }, { code: 'rur_bornage_geometre', statut: 'en_cours' }, { code: 'rur_cloture_enquete', statut: 'a_faire' }] };
    DATA.dossiers_fonciers = [d]; DATA.enquetes_fonciers = [{ id: 'e1', dossier_id: 'd1', statut: 'ouverte', date_fin_prevue: '2999-01-01' }]; DATA.bornages_fonciers = [];
    window.fcDossier = function (id) { return DATA.dossiers_fonciers.find(function (x) { return x.id === id; }); };
    window.fcEtape = function (dd, c) { return dd.etapes.find(function (x) { return x.code === c; }); };
    window.fcChangerStatutEtape = async function (id, c) { fcEtape(fcDossier(id), c).statut = 'termine'; return { ok: true }; };
    await fonRuralEtapesSync({ dossier_id: 'd1', parcelle_id: 'p1' });
    var a = d.etapes.map(function (e) { return e.statut; });
    DATA.bornages_fonciers = [{ id: 'b1', dossier_id: 'd1', statut: 'realise', pv_ref: 'PV1', convocations: [{ nom: 'X', present: true }] }];
    await fonRuralEtapesSync({ dossier_id: 'd1' });
    return { avant: a, apres: d.etapes.map(function (e) { return e.statut; }) };
  });
  assert.deepEqual(r.avant, ['termine', 'en_cours', 'a_faire']);
  assert.deepEqual(r.apres, ['termine', 'termine', 'a_faire']);
});
