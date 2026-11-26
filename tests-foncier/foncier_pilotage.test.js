/* Foncier L7 — pilotage et alertes : le VRAI ERP (Chromium). Date de référence fixée : 2026-06-15. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.parcelles = [
      { id: 'u1', ref: 'U-1', regime: 'urbain', superficie: 20000, prix_acq: 10000000, frais_notaire: 1000000, statut: 'acd', risque: 'eleve' },
      { id: 'r1', ref: 'R-1', regime: 'rural', superficie: 100000, prix_acq: 5000000, statut: 'prospection' },
      { id: 'r2', ref: 'R-2', regime: 'rural', superficie: 50000, cout_total: 2500000, statut: 'prospection' },
      { id: 'x', ref: 'X', regime: 'urbain', superficie: 999, decoupee_dans: 'u1' }];
    DATA.enquetes_fonciers = [
      { id: 'e1', reference: 'ENQ-1', parcelle_id: 'r1', statut: 'ouverte', date_fin_prevue: '2026-05-01' },
      { id: 'e2', reference: 'ENQ-2', parcelle_id: 'r2', statut: 'ouverte', date_fin_prevue: '2026-06-10' },
      { id: 'e3', reference: 'ENQ-3', parcelle_id: 'r2', statut: 'ouverte', date_fin_prevue: '2026-06-15' },
      { id: 'e4', reference: 'ENQ-4', parcelle_id: 'r2', statut: 'ouverte', date_fin_prevue: '2026-06-20' },
      { id: 'e5', reference: 'ENQ-5', parcelle_id: 'r2', statut: 'ouverte', date_fin_prevue: '2026-08-01' },
      { id: 'e6', reference: 'ENQ-6', parcelle_id: 'r1', statut: 'cloturee', date_fin_prevue: '2026-01-01' }];
    DATA.oppositions_fonciers = [
      { id: 'o1', reference: 'OPP-1', parcelle_id: 'r1', opposant: 'A', statut: 'ouverte', date_depot: '2026-01-01' },
      { id: 'o2', reference: 'OPP-2', parcelle_id: 'r1', opposant: 'B', statut: 'en_mediation', date_depot: '2026-05-01' },
      { id: 'o3', reference: 'OPP-3', parcelle_id: 'r1', opposant: 'C', statut: 'ouverte', date_depot: '2026-06-10' },
      { id: 'o4', reference: 'OPP-4', parcelle_id: 'r1', opposant: 'D', statut: 'levee', date_depot: '2025-01-01', issue: 'ok' }];
    DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-1', parcelle_id: 'r1', statut: 'convoque', date: '2026-06-01' }, { id: 'b2', reference: 'BRN-2', parcelle_id: 'r1', statut: 'convoque', date: '2026-06-30' }];
    DATA.villages_fonciers = [{ id: 'v1', reference: 'VIL-1', nom: 'Dabou', comite: { mandat_fin: '2026-03-01' } }, { id: 'v2', reference: 'VIL-2', nom: 'Jacqueville', comite: { mandat_fin: '2026-07-01' } }, { id: 'v3', reference: 'VIL-3', nom: 'Lahou', comite: { mandat_fin: '2027-07-01' } }];
    DATA.contrats_fonciers = [
      { id: 'k1', reference: 'CTR-1', partie: 'M. P', statut: 'actif', date_fin: '2026-05-31', echeances: [{ date: '2025-06-01', montant: 100, statut: 'paye' }, { date: '2026-06-01', montant: 100, statut: 'a_payer' }, { date: '2027-06-01', montant: 100, statut: 'a_payer' }] },
      { id: 'k2', reference: 'CTR-2', partie: 'M. R', statut: 'resilie', echeances: [{ date: '2026-01-01', montant: 999, statut: 'a_payer' }] }];
    DATA.charges_fonciers = [{ id: 'c1', reference: 'INS-1', type: 'hypotheque', parcelle_id: 'u1', statut: 'active', date_fin: '2026-01-01' }, { id: 'c2', reference: 'S-1', type: 'servitude', parcelle_id: 'u1', statut: 'active' }, { id: 'c3', type: 'saisie', reference: 'SA-1', parcelle_id: 'u1', statut: 'levee' }];
    DATA.exploitations_fonciers = [{ id: 'x1', parcelle_id: 'r1', statut: 'en_cours', superficie_ha: 2.5 }, { id: 'x2', parcelle_id: 'r1', statut: 'terminee', superficie_ha: 9 }];
    DATA.titres_fonciers = [{ id: 't1', type: 'certificat_foncier' }, { id: 't2', type: 'certificat_foncier' }, { id: 't3', type: 'acd' }, { id: 't4', type: 'tf_definitif' }];
    DATA.dossiers_fonciers = [{ id: 'd1', type_procedure: 'immatriculation_rurale', statut: 'cloture', date_ouverture: '2026-01-01', date_cloture: '2026-01-31' }, { id: 'd2', type_procedure: 'immatriculation_rurale', statut: 'cloture', date_ouverture: '2026-01-01', date_cloture: '2026-03-02' },
      { id: 'd3', type_procedure: 'immatriculation_rurale', statut: 'ouvert' }, { id: 'd4', type_procedure: 'immatriculation_rurale', statut: 'annule' }];
  });
}

test('alertes : niveaux, seuils et textes (enquêtes, oppositions, bornages, comités, contrats, charges)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(function () { return fonAlertes('2026-06-15').map(function (a) { return a.niveau + '|' + a.vue + '|' + a.ref + '|' + a.texte; }); });
    const ref = (v, id) => r.filter(function (l) { return l.split('|')[1] === v && l.split('|')[2] === id; });
    assert.match(ref('enquetes', 'ENQ-1')[0], /^rouge\|.*dépassée de 45 j/); assert.match(ref('enquetes', 'ENQ-2')[0], /^orange\|.*dépassée de 5 j/); assert.match(ref('enquetes', 'ENQ-3')[0], /^orange\|.*aujourd'hui/);
    assert.match(ref('enquetes', 'ENQ-4')[0], /^info\|.*dans 5 j/); assert.equal(ref('enquetes', 'ENQ-5').length, 0); assert.equal(ref('enquetes', 'ENQ-6').length, 0);
    assert.match(ref('oppositions', 'OPP-1')[0], /^rouge\|.*165 j/); assert.match(ref('oppositions', 'OPP-2')[0], /^orange/); assert.equal(ref('oppositions', 'OPP-3').length, 0); assert.equal(ref('oppositions', 'OPP-4').length, 0);
    assert.match(ref('bornages', 'BRN-1')[0], /^orange/); assert.equal(ref('bornages', 'BRN-2').length, 0);
    assert.match(ref('villages', 'VIL-1')[0], /^orange.*expiré/); assert.match(ref('villages', 'VIL-2')[0], /^info.*expire/); assert.equal(ref('villages', 'VIL-3').length, 0);
    assert.equal(ref('contrats', 'CTR-1').length, 2); assert.ok(ref('contrats', 'CTR-1').some(function (l) { return /^rouge.*1 redevance\(s\) impayée\(s\)/.test(l); })); assert.ok(ref('contrats', 'CTR-1').some(function (l) { return /^orange.*échu/.test(l); }));
    assert.equal(ref('contrats', 'CTR-2').length, 0); assert.match(ref('charges', 'INS-1')[0], /^info/); assert.equal(ref('charges', 'S-1').length, 0);
    const niveaux = r.map(function (l) { return l.split('|')[0]; }), ordre = { rouge: 0, orange: 1, info: 2 };
    assert.deepEqual(niveaux, niveaux.slice().sort(function (a, b) { return ordre[a] - ordre[b]; }));
  } finally { await app.fermer(); }
});

test('indicateurs : régimes, coûts à l\'hectare, procédures, enquêtes, oppositions, contrats, charges', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const k = await app.page.evaluate(function () { return fonPilotageIndicateurs('2026-06-15'); });
    assert.equal(k.regimes.urbain.n, 1); assert.equal(k.regimes.urbain.ha, 2); assert.equal(k.regimes.urbain.cout_ha, 5500000);
    assert.equal(k.regimes.rural.n, 2); assert.equal(k.regimes.rural.ha, 15); assert.equal(k.regimes.rural.cout_ha, 500000);
    assert.equal(k.statuts.acd, 1); assert.equal(k.statuts.prospection, 2); assert.equal(k.risque_eleve, 1);
    assert.deepEqual(k.titres, { certificat_foncier: 2, acd: 1, tf_definitif: 1 });
    const p = k.procedures.immatriculation_rurale; assert.equal(p.ouverts, 1); assert.equal(p.clos, 2); assert.equal(p.delai_moyen, 45);
    assert.deepEqual(k.enquetes, { ouvertes: 5, cloturees: 1, en_retard: 3 }); assert.deepEqual(k.oppositions, { actives: 3, levees: 1, total: 4 });
    assert.deepEqual(k.contrats, { actifs: 1, impayes_nb: 1, impayes_montant: 100, encaisse: 100 }); assert.equal(k.exploitation_ha, 2.5); assert.equal(k.charges_bloquantes, 1);
  } finally { await app.fermer(); }
});

test('écran : pilotage affiché, badge = alertes non « info », export CSV, aucune erreur de page', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(function () {
      const vraie = fcAuj; fcAuj = function () { return '2026-06-15'; };
      fonRuralVue('pilotage'); const h = document.getElementById('fon-rural-liste').innerHTML, badge = document.getElementById('fon-rural-badge');
      const res = { kpi: /Parcelles rurales/.test(h) && /Oppositions actives/.test(h), alertes: /🔔 Alertes \((\d+)\)/.exec(h)[1], badge: badge.textContent, visible: badge.style.display, proc: /45 j/.test(h) };
      let csv = ''; const A = URL.createObjectURL; URL.createObjectURL = function (b) { csv = b; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {}; fonPilotageExporter(); URL.createObjectURL = A;
      res.csv = csv instanceof Blob && csv.size > 100; fcAuj = vraie; return res;
    });
    assert.equal(r.kpi, true); assert.equal(r.proc, true); assert.equal(r.csv, true); assert.equal(r.visible, 'inline-block');
    assert.equal(Number(r.alertes) >= Number(r.badge) && Number(r.badge) > 0, true); assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});

test('sans donnée : « Aucune alerte », badge masqué, zéros partout', async () => {
  const app = await ouvrirApp();
  try {
    const r = await app.page.evaluate(function () {
      ['parcelles', 'enquetes_fonciers', 'oppositions_fonciers', 'bornages_fonciers', 'villages_fonciers', 'contrats_fonciers', 'charges_fonciers', 'exploitations_fonciers', 'titres_fonciers', 'dossiers_fonciers'].forEach(function (s) { DATA[s] = []; });
      fonRuralVue('pilotage'); return { h: /Aucune alerte/.test(document.getElementById('fon-rural-liste').innerHTML), badge: document.getElementById('fon-rural-badge').style.display, k: fonPilotageIndicateurs() };
    });
    assert.equal(r.h, true); assert.equal(r.badge, 'none'); assert.equal(r.k.charges_bloquantes, 0); assert.deepEqual(r.k.regimes, {});
  } finally { await app.fermer(); }
});
