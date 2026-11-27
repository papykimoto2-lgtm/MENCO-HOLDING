/* Foncier rural L3 — contrôles de la procédure rurale dans le VRAI ERP (Chromium) : enquête, opposition, bornage, dérogation. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  return page.evaluate(async function () {
    DATA.params.fc_dependances = false;
    DATA.parcelles = [{ id: 'pc1', ref: 'PARC-R1', regime: 'rural', superficie: 10000 }];
    DATA.dossiers_fonciers = []; DATA.enquetes_fonciers = []; DATA.oppositions_fonciers = []; DATA.bornages_fonciers = [];
    const r = await fcOuvrirDossier({ parcelle_id: 'pc1', type: 'immatriculation_rurale', responsable_id: 'u1' });
    window.__d = r.dossier.id;
    r.dossier.etapes.forEach(function (e) { e.justificatif_requis = false; }); /* seules les règles rurales sont testées ici */
    window.__st = async function (code, statut, o) { const x = await fcChangerStatutEtape(window.__d, code, statut, o); return { ok: x.ok, rural: !!x.rural, erreur: x.erreur || '' }; };
    window.__jour = function (n) { return new Date(Date.now() + n * 864e5).toISOString().slice(0, 10); };
    return r.ok;
  });
}

test('ouverture d\'enquête : bloquée sans enquête enregistrée, libre avec', async () => {
  const app = await ouvrirApp();
  try {
    assert.equal(await amorcer(app.page), true);
    const r = await app.page.evaluate(async function () {
      const a = await __st('rur_ouverture_enquete', 'termine');
      DATA.enquetes_fonciers.push({ id: 'e1', reference: 'ENQ-1', parcelle_id: 'pc1', statut: 'ouverte', date_ouverture: __jour(-5), duree_jours: 30, date_fin_prevue: fonEnqueteFin(__jour(-5), 30) });
      return { a: a, b: await __st('rur_ouverture_enquete', 'termine') };
    });
    assert.equal(r.a.ok, false); assert.equal(r.a.rural, true);
    assert.equal(r.b.ok, true, r.b.erreur);
  } finally { await app.fermer(); }
});

test('clôture d\'enquête : échéance + bornage contradictoire exigés', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.enquetes_fonciers.push({ id: 'e1', parcelle_id: 'pc1', statut: 'ouverte', date_ouverture: __jour(-5), date_fin_prevue: fonEnqueteFin(__jour(-5), 30) });
      const tot = await __st('rur_cloture_enquete', 'termine');
      DATA.enquetes_fonciers[0].date_ouverture = __jour(-40); DATA.enquetes_fonciers[0].date_fin_prevue = fonEnqueteFin(__jour(-40), 30);
      const sansBornage = await __st('rur_cloture_enquete', 'termine');
      DATA.bornages_fonciers.push({ id: 'b1', parcelle_id: 'pc1', statut: 'realise', pv_ref: 'PV-1', convocations: [{ nom: 'Voisin', present: true }] });
      return { tot: tot, sansBornage: sansBornage, ok: await __st('rur_cloture_enquete', 'termine') };
    });
    assert.match(r.tot.erreur, /restants/); assert.match(r.tot.erreur, /bornage/);
    assert.equal(r.sansBornage.ok, false); assert.match(r.sansBornage.erreur, /bornage/); assert.doesNotMatch(r.sansBornage.erreur, /restants/);
    assert.equal(r.ok.ok, true, r.ok.erreur);
  } finally { await app.fermer(); }
});

test('opposition active : certificat foncier et réunion de validation suspendus, puis libérés à la levée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.oppositions_fonciers.push({ id: 'o1', reference: 'OPP-1', parcelle_id: 'pc1', opposant: 'Famille K', motif: 'limite', statut: 'ouverte' });
      const a = await __st('rur_certificat_foncier', 'termine'), a2 = await __st('rur_reunion_validation', 'en_cours');
      DATA.oppositions_fonciers[0].statut = 'en_mediation';
      const m = await __st('rur_certificat_foncier', 'termine');
      DATA.oppositions_fonciers[0].statut = 'levee'; DATA.oppositions_fonciers[0].issue = 'accord';
      return { a: a, a2: a2, m: m, b: await __st('rur_certificat_foncier', 'termine') };
    });
    [r.a, r.a2, r.m].forEach(function (x) { assert.equal(x.ok, false); assert.equal(x.rural, true); assert.match(x.erreur, /opposition/); });
    assert.equal(r.b.ok, true, r.b.erreur);
  } finally { await app.fermer(); }
});

test('dérogation : administrateur + motif obligatoires, journalisée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.oppositions_fonciers.push({ id: 'o1', reference: 'OPP-1', parcelle_id: 'pc1', opposant: 'X', motif: 'm', statut: 'ouverte' });
      const sansMotif = await __st('rur_certificat_foncier', 'termine', { derogation_rural: true });
      const vraiAdmin = fcEstAdmin; fcEstAdmin = function () { return false; };
      const nonAdmin = await __st('rur_certificat_foncier', 'termine', { derogation_rural: true, motif: 'urgence' });
      fcEstAdmin = vraiAdmin;
      const ok = await __st('rur_certificat_foncier', 'termine', { derogation_rural: true, motif: 'décision du sous-préfet' });
      return { sansMotif: sansMotif, nonAdmin: nonAdmin, ok: ok, ev: DATA.evenements_fonciers.filter(function (e) { return e.type === 'derogation'; }).length };
    });
    assert.equal(r.sansMotif.ok, false); assert.match(r.sansMotif.erreur, /motif/);
    assert.equal(r.nonAdmin.ok, false); assert.match(r.nonAdmin.erreur, /administrateur/);
    assert.equal(r.ok.ok, true, r.ok.erreur); assert.equal(r.ev, 1);
  } finally { await app.fermer(); }
});

test('interrupteur fon_controle_rural = false : aucun contrôle rural', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.params.fon_controle_rural = false;
      DATA.oppositions_fonciers.push({ id: 'o1', parcelle_id: 'pc1', opposant: 'X', motif: 'm', statut: 'ouverte' });
      return __st('rur_certificat_foncier', 'termine');
    });
    assert.equal(r.ok, true, r.erreur);
  } finally { await app.fermer(); }
});

test('écrans : enquête enregistrée avec échéance calculée ; clôture anticipée refusée sans motif ; bornage sans PV refusé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.dossiers_fonciers = (DATA.dossiers_fonciers || []).concat([{ id: 'dos1', reference: 'DF-T1', parcelle_id: 'pc1', statut: 'en_cours', etapes: [] }]);
      fonRuralOuvrir('enquetes');
      document.getElementById('fonr-dossier_id').value = 'dos1';   /* dossier obligatoire : la parcelle en découle */
      document.getElementById('fonr-commissaire').value = 'M. Koffi';
      document.getElementById('fonr-statut').value = 'ouverte';
      document.getElementById('fonr-date_ouverture').value = __jour(0);
      await fonRuralEnregistrer();
      const e = DATA.enquetes_fonciers[0];
      const avant = { fin: e.date_fin_prevue, attendu: fonEnqueteFin(__jour(0), 30), ref: e.reference, statut: e.statut };
      window.prompt = function () { return ''; };
      await fonRuralAction('enquetes', e.id, 'cloturer');
      const apresRefus = DATA.enquetes_fonciers[0].statut;
      window.prompt = function () { return 'urgence validée'; };
      await fonRuralAction('enquetes', e.id, 'cloturer');
      DATA.bornages_fonciers.push({ id: 'b1', reference: 'BRN-1', parcelle_id: 'pc1', statut: 'convoque', convocations: [{ nom: 'A', present: true }] });
      await fonRuralAction('bornages', 'b1', 'realise');
      const bornageSansPv = DATA.bornages_fonciers[0].statut;
      return { avant: avant, apresRefus: apresRefus, final: DATA.enquetes_fonciers[0].statut, motif: DATA.enquetes_fonciers[0].derogation_motif, bornageSansPv: bornageSansPv };
    });
    assert.equal(r.avant.fin, r.avant.attendu); assert.match(r.avant.ref, /^ENQ-\d{4}-001$/);
    assert.equal(r.apresRefus, 'ouverte'); assert.equal(r.final, 'cloturee'); assert.equal(r.motif, 'urgence validée');
    assert.equal(r.bornageSansPv, 'convoque');
  } finally { await app.fermer(); }
});
