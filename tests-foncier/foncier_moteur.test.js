/* Foncier L13 — moteur d'impression, de modification et de suppression : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.parcelles = [{ id: 'p1', ref: 'TERRE-1', commune: 'Dabou', superficie: 20000, regime: 'rural', statut: 'prospection', historique: [] }];
    DATA.villages_fonciers = [{ id: 'v1', reference: 'VIL-2026-001', nom: 'Dabou-Village', comite: { membres: [{ nom: 'K', fonction: 'Président' }] } }];
    DATA.enquetes_fonciers = [{ id: 'e1', reference: 'ENQ-2026-001', parcelle_id: 'p1', commissaire: 'M. Koffi', statut: 'planifiee', duree_jours: 30 }, { id: 'e2', reference: 'ENQ-2026-002', parcelle_id: 'p1', commissaire: 'M. Yao', statut: 'cloturee', date_ouverture: '2026-01-01', date_fin_prevue: '2026-01-31', date_cloture: '2026-02-01' }];
    DATA.oppositions_fonciers = [{ id: 'o1', reference: 'OPP-2026-001', parcelle_id: 'p1', opposant: 'A', motif: 'limite contestée', statut: 'ouverte' }, { id: 'o2', reference: 'OPP-2026-002', parcelle_id: 'p1', opposant: 'B', motif: 'x', statut: 'levee', issue: 'accord' }, { id: 'o3', reference: 'OPP-2026-003', parcelle_id: 'p1', opposant: 'C', motif: 'y', statut: 'ouverte', mediation: [{ date: '2026-01-01', note: 'n' }] }];
    DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-2026-001', parcelle_id: 'p1', statut: 'realise', pv_ref: 'PV1', convocations: [{ nom: 'R', qualite: 'riverain', present: true }] }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', reference: 'AYD-2026-001', nom: 'Famille K', village_id: 'v1', parcelles: [{ parcelle_id: 'p1', ref: 'TERRE-1', part: 100 }] }];
    DATA.titres_fonciers = [{ id: 't1', reference: 'TIT-2026-001', parcelle_id: 'p1', type: 'certificat_foncier', numero: 'CF-1', date: '2026-03-01' }];
    DATA.proprietaires_fonciers = [{ id: 'pr1', reference: 'PRP-2026-001', parcelle_id: 'p1', proprietaire: 'X', quote_part: 100, date_debut: '2020-01-01', date_fin: '2024-01-01' }, { id: 'pr2', reference: 'PRP-2026-002', parcelle_id: 'p1', proprietaire: 'Y', quote_part: 100, date_debut: '2024-01-01' }];
    DATA.charges_fonciers = [{ id: 'c1', reference: 'CHG-2026-001', parcelle_id: 'p1', type: 'servitude', statut: 'active' }, { id: 'c2', reference: 'CHG-2026-002', parcelle_id: 'p1', type: 'servitude', statut: 'levee', mainlevee_ref: 'ML1' }];
    DATA.exploitations_fonciers = [{ id: 'x1', reference: 'EXP-2026-001', parcelle_id: 'p1', exploitant: 'Z', culture: 'hévéa', superficie_ha: 1, statut: 'en_cours' }];
    DATA.contrats_fonciers = [{ id: 'k1', reference: 'CTR-2026-001', parcelle_id: 'p1', type: 'bail', partie: 'M. P', statut: 'actif', periodicite: 'annuelle', redevance: 100, date_debut: '2026-01-01', date_fin: '2027-01-01', echeances: [{ id: 'q', date: '2026-01-01', montant: 100, statut: 'paye', date_paiement: '2026-01-02', reference: 'RC1' }] }, { id: 'k2', reference: 'CTR-2026-002', parcelle_id: 'p1', type: 'bail', partie: 'M. Q', statut: 'brouillon', periodicite: 'unique', redevance: 0 }];
    DATA.audits_fonciers = []; DATA.protocoles_purge_fonciers = []; DATA.cessions_foncieres = [];
    window._logs = []; var lo = window.logAction; window.logAction = function (t, d) { window._logs.push(t + '|' + d); return Promise.resolve(); };
    window.prompt = function () { return 'Erreur de saisie constatée par le service foncier'; };
  });
}

test('impression : fiche de chaque type, liste et CSV', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(function () {
      var out = {}; ['enquetes', 'oppositions', 'bornages', 'villages', 'ayants_droit', 'titres', 'proprietaires', 'charges', 'exploitations', 'contrats'].forEach(function (k) {
        var rec = (DATA[FON_RURAL_TYPES[k].store] || [])[0]; out[k] = fonRuralFicheHtml(k, rec); });
      out.liste = fonRuralListeHtml('enquetes'); out.csv = fonRuralCsv('oppositions'); out.btns = _fonBtnsMoteur('enquetes', DATA.enquetes_fonciers[0]) + '|' + _fonBtnsMoteur('protocoles', { id: 'z' });
      out.parc = fonParcoursImprimer(); out.f360 = fonFiche360Imprimer('p1'); return out;
    });
    assert.match(r.enquetes, /ENQ-2026-001/); assert.match(r.enquetes, /M\. Koffi/); assert.match(r.enquetes, /TERRE-1 — Dabou/); assert.match(r.enquetes, /Commissaire enquêteur/);
    assert.match(r.oppositions, /limite contestée/); assert.match(r.villages, /Dabou-Village/); assert.match(r.ayants_droit, /Famille K/); assert.match(r.titres, /CF-1/);
    assert.match(r.proprietaires, /Chaîne de propriété/); assert.match(r.proprietaires, /actuel/); assert.match(r.contrats, /Échéancier/); assert.match(r.contrats, /RC1/);
    ['enquetes', 'oppositions', 'bornages', 'villages', 'ayants_droit', 'titres', 'proprietaires', 'charges', 'exploitations', 'contrats'].forEach(k => assert.match(r[k], /Nom, date et signature/, k));
    assert.match(r.liste, /2 enregistrement/); assert.match(r.liste, /ENQ-2026-002/);
    assert.ok(r.csv.startsWith('﻿"Référence"')); assert.equal(r.csv.split('\r\n').length, 4); assert.match(r.csv, /OPP-2026-003/);
    assert.match(r.btns, /fonRuralImprimerFiche/); assert.match(r.btns, /fonRuralSupprimer/); assert.equal((r.btns.match(/fonRuralImprimerFiche/g) || []).length, 1);
    assert.match(r.parc, /Parcours foncier/); assert.match(r.f360, /Fiche parcelle 360/); assert.doesNotMatch(r.f360, /<button/);
    // boutons présents sur l'écran + liste
    await app.page.evaluate(() => { goTo('foncier'); switchTab('foncier', 'rural'); fonRuralVue('enquetes'); });
    const h = await app.page.evaluate(() => document.getElementById('fon-rural-liste').innerHTML + document.getElementById('fon-rural-onglets').innerHTML);
    assert.match(h, /fonRuralSupprimer\('enquetes'/); assert.match(h, /Imprimer la liste/); assert.match(h, /Excel \(CSV\)/); assert.match(h, /Nouvelle|Enquête officielle/);
  } finally { await app.fermer(); }
});

test('modification : diff tracé, enregistrement clos = administrateur + motif, document signé verrouillé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    await app.page.evaluate(async () => { fonRuralOuvrir('enquetes', 'e1'); document.getElementById('fonr-commissaire').value = 'M. Diallo'; await fonRuralEnregistrer(); });
    const h = await app.page.evaluate(() => DATA.enquetes_fonciers[0].historique_modifs);
    assert.equal(h.length, 1); assert.equal(h[0].champs[0].k, 'commissaire'); assert.equal(h[0].champs[0].avant, 'M. Koffi'); assert.equal(h[0].champs[0].apres, 'M. Diallo');
    assert.match(await app.page.evaluate(() => fonRuralFicheHtml('enquetes', DATA.enquetes_fonciers[0])), /Historique des modifications/);
    // sans changement : pas de trace
    await app.page.evaluate(async () => { fonRuralOuvrir('enquetes', 'e1'); await fonRuralEnregistrer(); });
    assert.equal(await app.page.evaluate(() => DATA.enquetes_fonciers[0].historique_modifs.length), 1);
    // clos : administrateur + motif
    await app.page.evaluate(async () => { fonRuralOuvrir('enquetes', 'e2'); document.getElementById('fonr-commissaire').value = 'M. Autre'; window.prompt = () => 'court'; await fonRuralEnregistrer(); });
    assert.equal(await app.page.evaluate(() => DATA.enquetes_fonciers[1].commissaire), 'M. Yao');
    await app.page.evaluate(async () => { fonRuralOuvrir('enquetes', 'e2'); document.getElementById('fonr-commissaire').value = 'M. Autre'; window.prompt = () => 'Correction du nom du commissaire sur le PV'; await fonRuralEnregistrer(); });
    const e2 = await app.page.evaluate(() => DATA.enquetes_fonciers[1]);
    assert.equal(e2.commissaire, 'M. Autre'); assert.match(e2.historique_modifs[0].motif, /Correction du nom/);
    // non administrateur : clos non modifiable
    await app.page.evaluate(() => { window._hr = hasRole; window.hasRole = () => false; });
    assert.equal(await app.page.evaluate(() => fonRuralVerrouModif('enquetes', DATA.enquetes_fonciers[1]).bloque), true);
    assert.equal(await app.page.evaluate(() => fonRuralVerrouModif('enquetes', DATA.enquetes_fonciers[0]).bloque), false);
    assert.equal(await app.page.evaluate(() => fonRuralVerrouModif('protocoles', { statut: 'signe' }).bloque), true);
    await app.page.evaluate(() => { window.hasRole = window._hr; });
    assert.equal(await app.page.evaluate(() => fonRuralVerrouModif('protocoles', { statut: 'reitere' }).bloque), true);
  } finally { await app.fermer(); }
});

test('suppression : règles par type, administrateur, motif, trace', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const bloq = (k, id) => app.page.evaluate(([k, id]) => fonRuralSuppressionBloquee(k, DATA[FON_RURAL_TYPES[k].store].filter(x => x.id === id)[0]).join(' ; '), [k, id]);
    assert.match(await bloq('enquetes', 'e2'), /clôturée/); assert.equal(await bloq('enquetes', 'e1'), '');
    assert.equal(await bloq('oppositions', 'o1'), ''); assert.match(await bloq('oppositions', 'o2'), /traitée/); assert.match(await bloq('oppositions', 'o3'), /médiation/);
    assert.match(await bloq('bornages', 'b1'), /réalisé/);
    assert.match(await bloq('villages', 'v1'), /ayant\(s\) droit/);
    assert.match(await bloq('proprietaires', 'pr1'), /maillon|postérieurs/); assert.equal(await bloq('proprietaires', 'pr2'), '');
    assert.match(await bloq('charges', 'c2'), /levée/); assert.equal(await bloq('charges', 'c1'), '');
    assert.match(await bloq('contrats', 'k1'), /encaissée/); assert.equal(await bloq('contrats', 'k2'), '');
    assert.equal(await bloq('exploitations', 'x1'), '');
    await app.page.evaluate(() => { DATA.parcelles[0].statut = 'tf_definitif'; });
    assert.match(await bloq('titres', 't1'), /dernier titre/);
    await app.page.evaluate(() => { DATA.protocoles_purge_fonciers = [{ id: 'z', statut: 'signe', parcelle_id: 'p1', village_id: 'v1' }]; });
    assert.match(await bloq('ayants_droit', 'a1'), /protocole signé/);
    // refus : bloqué, puis non-administrateur, puis motif court
    assert.equal(await app.page.evaluate(() => fonRuralSupprimer('enquetes', 'e2')), false);
    await app.page.evaluate(() => { window._hr = hasRole; window.hasRole = () => false; });
    assert.equal(await app.page.evaluate(() => fonRuralSupprimer('enquetes', 'e1')), false);
    await app.page.evaluate(() => { window.hasRole = window._hr; window.prompt = () => 'court'; });
    assert.equal(await app.page.evaluate(() => fonRuralSupprimer('enquetes', 'e1')), false);
    assert.equal(await app.page.evaluate(() => DATA.enquetes_fonciers.length), 2);
    // succès
    await app.page.evaluate(() => { window.prompt = () => 'Enquête ouverte par erreur sur la mauvaise parcelle'; });
    assert.equal(await app.page.evaluate(() => fonRuralSupprimer('enquetes', 'e1')), true);
    assert.equal(await app.page.evaluate(() => DATA.enquetes_fonciers.map(x => x.id).join()), 'e2');
    assert.equal(await app.page.evaluate(async () => (await dbGetAll('enquetes_fonciers')).filter(x => x.id === 'e1').length), 0);
    const hist = await app.page.evaluate(() => JSON.stringify(DATA.parcelles[0].historique));
    assert.match(hist, /Suppression/); assert.match(hist, /ENQ-2026-001/); assert.match(hist, /mauvaise parcelle/); assert.match(hist, /commissaire/);
    assert.ok(await app.page.evaluate(() => window._logs.some(l => l.startsWith('FONCIER_SUPPRESSION|') && /ENQ-2026-001/.test(l))));
  } finally { await app.fermer(); }
});
