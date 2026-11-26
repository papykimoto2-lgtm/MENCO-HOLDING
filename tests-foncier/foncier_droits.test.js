/* Foncier L5 — chaîne de propriété, charges, exploitations, contrats, ayants droit, titres : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.parcelles = [{ id: 'pc1', ref: 'PARC-1', regime: 'rural', superficie: 20000 }, { id: 'pc2', ref: 'PARC-2', regime: 'urbain', superficie: 5000 }];
    ['proprietaires_fonciers', 'charges_fonciers', 'exploitations_fonciers', 'contrats_fonciers', 'ayants_droit_fonciers', 'titres_fonciers', 'villages_fonciers', 'cessions_foncieres'].forEach(function (s) { DATA[s] = []; });
    window.__saisir = async function (kind, vals) {
      window.__toasts.length = 0; fonRuralOuvrir(kind);
      Object.keys(vals).forEach(function (k) { const el = document.getElementById('fonr-' + k); if (el.tagName === 'SELECT' && !el.querySelector('option[value="' + vals[k] + '"]')) el.innerHTML += '<option value="' + vals[k] + '">' + vals[k] + '</option>'; el.value = vals[k]; });
      await fonRuralEnregistrer(); return { toasts: window.__toasts.slice(), n: DATA[FON_RURAL_TYPES[kind].store].length };
    };
    window.__prompts = function (list) { const l = list.slice(); window.prompt = function () { return l.length ? l.shift() : null; }; };
  });
}
const T = (page, fn, arg) => page.evaluate(fn, arg);

test('échéancier : annuel, mensuel sans dérive de fin de mois, paiement unique', async () => {
  const app = await ouvrirApp();
  try {
    const r = await T(app.page, function () { return { a: fonEcheancier('2026-03-15', '2028-03-15', 'annuelle', 100).map(function (e) { return e.date; }), m: fonEcheancier('2026-01-31', '2026-04-30', 'mensuelle', 10).map(function (e) { return e.date; }),
      u: fonEcheancier('2026-05-01', '', 'unique', 500), t: fonEcheancier('2026-01-01', '2026-12-31', 'trimestrielle', 1).length }; });
    assert.deepEqual(r.a, ['2026-03-15', '2027-03-15', '2028-03-15']); assert.deepEqual(r.m, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    assert.equal(r.u.length, 1); assert.equal(r.t, 4);
  } finally { await app.fermer(); }
});

test('propriétaires : quotes-parts ≤ 100 %, puis transfert (ancien clos, nouveau actuel)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __saisir('proprietaires', { parcelle_id: 'pc1', proprietaire: 'Famille K', quote_part: '60', date_debut: '2026-01-01' });
      const b = await __saisir('proprietaires', { parcelle_id: 'pc1', proprietaire: 'M. Y', quote_part: '60', date_debut: '2026-01-01' });
      const c = await __saisir('proprietaires', { parcelle_id: 'pc1', proprietaire: 'M. Y', quote_part: '40', date_debut: '2026-01-01' });
      const idK = DATA.proprietaires_fonciers[0].id;
      __prompts(['Société Z', 'vente', 'ACTE-77']); await fonRuralAction('proprietaires', idK, 'transferer');
      return { a: a.n, b: b.n, bMsg: b.toasts.join('|'), c: c.n, actuels: fonProprietairesActuels('pc1').map(function (x) { return x.proprietaire + ':' + x.quote_part; }), clos: DATA.proprietaires_fonciers.find(function (x) { return x.id === idK; }).date_fin };
    });
    assert.equal(r.a, 1); assert.equal(r.b, 1); assert.match(r.bMsg, /120 %/); assert.equal(r.c, 2);
    assert.deepEqual(r.actuels.sort(), ['M. Y:40', 'Société Z:60']); assert.ok(r.clos);
  } finally { await app.fermer(); }
});

test('charges : hypothèque sans référence refusée ; mainlevée obligatoire ; cession bloquée tant que la charge est active', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __saisir('charges', { parcelle_id: 'pc1', type: 'hypotheque', beneficiaire: 'Banque X', montant: '5000000' });
      const b = await __saisir('charges', { parcelle_id: 'pc1', type: 'hypotheque', beneficiaire: 'Banque X', montant: '5000000', reference: 'INS-12' });
      const s = await __saisir('charges', { parcelle_id: 'pc1', type: 'servitude' });
      const id = DATA.charges_fonciers[0].id, bloque1 = fonChargesBloquantes('pc1').length;
      __prompts(['']); await fonRuralAction('charges', id, 'lever'); const sansRef = DATA.charges_fonciers[0].statut;
      __prompts(['ML-5']); await fonRuralAction('charges', id, 'lever');
      return { a: a.n, aMsg: a.toasts.join('|'), b: b.n, s: s.n, bloque1: bloque1, sansRef: sansRef, statut: DATA.charges_fonciers[0].statut, bloque2: fonChargesBloquantes('pc1').length };
    });
    assert.equal(r.a, 0); assert.match(r.aMsg, /référence/); assert.equal(r.b, 1); assert.equal(r.s, 2);
    assert.equal(r.bloque1, 1); assert.equal(r.sansRef, 'active'); assert.equal(r.statut, 'levee'); assert.equal(r.bloque2, 0);
  } finally { await app.fermer(); }
});

test('cession : bloquée par une hypothèque active (non-admin), dérogation administrateur motivée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      DATA.charges_fonciers = [{ id: 'g1', parcelle_id: 'pc1', type: 'hypotheque', reference: 'INS-1', statut: 'active' }];
      cesNew();
      const sel = document.getElementById('ces-source'); sel.innerHTML = '<option value="parcelle:pc1">pc1</option>'; sel.value = 'parcelle:pc1';
      document.getElementById('ces-type').value = 'physique'; document.getElementById('ces-nom').value = 'Acquéreur Test';
      const vraiAdmin = fcEstAdmin; fcEstAdmin = function () { return false; };
      window.__toasts.length = 0; await cesSave(); const nonAdmin = window.__toasts.join('|'), n1 = DATA.cessions_foncieres.length;
      fcEstAdmin = vraiAdmin; __prompts(['']); await cesSave(); const sansMotif = DATA.cessions_foncieres.length;
      return { nonAdmin: nonAdmin, n1: n1, sansMotif: sansMotif };
    });
    assert.match(r.nonAdmin, /Cession bloquée/); assert.equal(r.n1, 0); assert.equal(r.sansMotif, 0);
  } finally { await app.fermer(); }
});

test('exploitations : surfaces cumulées ≤ superficie de la parcelle ; fin libère la surface', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __saisir('exploitations', { parcelle_id: 'pc1', exploitant: 'K', culture: 'cacao', superficie_ha: '1.5' });
      const b = await __saisir('exploitations', { parcelle_id: 'pc1', exploitant: 'L', culture: 'hévéa', superficie_ha: '0.6' });
      await fonRuralAction('exploitations', DATA.exploitations_fonciers[0].id, 'terminer');
      const c = await __saisir('exploitations', { parcelle_id: 'pc1', exploitant: 'L', culture: 'hévéa', superficie_ha: '0.6' });
      const z = await __saisir('exploitations', { parcelle_id: 'pc1', exploitant: 'L', culture: 'x', superficie_ha: '0' });
      return { a: a.n, b: b.n, bMsg: b.toasts.join('|'), c: c.n, z: z.n };
    });
    assert.equal(r.a, 1); assert.equal(r.b, 1); assert.match(r.bMsg, /2\.1 ha/); assert.equal(r.c, 2); assert.equal(r.z, 2);
  } finally { await app.fermer(); }
});

test('contrats : activation → échéancier ; encaissement exact + référence ; impayés ; résiliation motivée ; redevance figée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const sansFin = await __saisir('contrats', { parcelle_id: 'pc1', type: 'bail', partie: 'M. Preneur', date_debut: '2025-01-01', redevance: '120000', periodicite: 'annuelle' });
      const ok = await __saisir('contrats', { parcelle_id: 'pc1', type: 'bail', partie: 'M. Preneur', date_debut: '2025-01-01', date_fin: '2028-01-01', redevance: '120000', periodicite: 'annuelle' });
      const id = DATA.contrats_fonciers[0].id; await fonRuralAction('contrats', id, 'activer');
      const c = DATA.contrats_fonciers[0], nb = c.echeances.length, impayes = fonContratImpayes(c, '2026-06-01').length;
      __prompts(['100000', 'REC-1']); await fonRuralAction('contrats', id, 'encaisser'); const partiel = c.echeances.filter(function (e) { return e.statut === 'paye'; }).length;
      __prompts(['120000', 'REC-2']); await fonRuralAction('contrats', id, 'encaisser'); const payees = c.echeances.filter(function (e) { return e.statut === 'paye'; }).length;
      const modif = await __saisir('contrats', { parcelle_id: 'pc1', type: 'bail', partie: 'M. Preneur', date_debut: '2025-01-01', date_fin: '2028-01-01', redevance: '1' , periodicite: 'annuelle' });
      __prompts(['']); await fonRuralAction('contrats', id, 'resilier'); const sansMotif = c.statut;
      __prompts(['non-paiement']); await fonRuralAction('contrats', id, 'resilier');
      return { sansFin: sansFin.n, sansFinMsg: sansFin.toasts.join('|'), ok: ok.n, nb: nb, impayes: impayes, partiel: partiel, payees: payees, etat: fonContratEtat(c, '2026-06-01'), sansMotif: sansMotif, statut: c.statut, ref: c.echeances[0].reference };
    });
    assert.equal(r.sansFin, 0); assert.match(r.sansFinMsg, /date de fin/); assert.equal(r.ok, 1); assert.equal(r.nb, 4); assert.equal(r.impayes, 2);
    assert.equal(r.partiel, 0); assert.equal(r.payees, 1); assert.equal(r.ref, 'REC-2'); assert.equal(r.sansMotif, 'actif'); assert.equal(r.statut, 'resilie');
  } finally { await app.fermer(); }
});

test('ayants droit : parcelle inconnue refusée, parts cumulées ≤ 100 %', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __saisir('ayants_droit', { nom: 'Famille K', parcelles: 'PARC-1 ; 70' });
      const b = await __saisir('ayants_droit', { nom: 'Famille L', parcelles: 'PARC-1 ; 40' });
      const c = await __saisir('ayants_droit', { nom: 'Famille M', parcelles: 'PARC-9 ; 10' });
      const d = await __saisir('ayants_droit', { nom: 'Famille N', parcelles: 'PARC-1 ; 30' });
      return { a: a.n, bMsg: b.toasts.join('|'), cMsg: c.toasts.join('|'), d: d.n, parts: DATA.ayants_droit_fonciers[0].parcelles[0].part };
    });
    assert.equal(r.a, 1); assert.match(r.bMsg, /110 %/); assert.match(r.cMsg, /introuvable/); assert.equal(r.d, 2); assert.equal(r.parts, 70);
  } finally { await app.fermer(); }
});

test('titres : régime repris de la parcelle, numéro unique par type, titre mère', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __saisir('titres', { parcelle_id: 'pc1', type: 'certificat_foncier', numero: 'CF-001' });
      const b = await __saisir('titres', { parcelle_id: 'pc2', type: 'certificat_foncier', numero: 'cf-001' });
      const c = await __saisir('titres', { parcelle_id: 'pc1', type: 'tf_definitif', numero: 'CF-001', parent_id: DATA.titres_fonciers[0].id });
      return { a: a.n, regime: DATA.titres_fonciers[0].regime, b: b.n, bMsg: b.toasts.join('|'), c: c.n, parent: DATA.titres_fonciers[1] && DATA.titres_fonciers[1].parent_id === DATA.titres_fonciers[0].id };
    });
    assert.equal(r.a, 1); assert.equal(r.regime, 'rural'); assert.equal(r.b, 1); assert.match(r.bMsg, /existe déjà/); assert.equal(r.c, 2); assert.equal(r.parent, true);
  } finally { await app.fermer(); }
});

test('écran : les 10 vues se dessinent sans erreur', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      await __saisir('proprietaires', { parcelle_id: 'pc1', proprietaire: 'A', quote_part: '100', date_debut: '2026-01-01' });
      const vues = ['enquetes', 'oppositions', 'bornages', 'villages', 'ayants_droit', 'titres', 'proprietaires', 'charges', 'exploitations', 'contrats'], res = [];
      vues.forEach(function (v) { fonRuralVue(v); res.push(document.getElementById('fon-rural-liste').innerHTML.length > 50); });
      return res;
    });
    assert.ok(r.every(Boolean)); assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});
