/* Foncier L8 — audit pré-acquisition (19 points Go / No-Go) : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(async function () {
    DATA.audits_fonciers = []; DATA.af_operations = []; DATA.parcelles = []; DATA.oppositions_fonciers = []; DATA.titres_fonciers = []; DATA.villages_fonciers = []; DATA.bornages_fonciers = [];
    DATA.params.fon_audit_obligatoire = true;
    window.__nouveau = async function (extra) {
      fonAuditNouveau();
      const v = function (id, x) { const e = document.getElementById(id); if (e && x !== undefined) e.value = x; };
      Object.keys(extra || {}).forEach(function (k) { v('fau-' + k, extra[k]); });
      if (!document.getElementById('fau-auditeur').value) v('fau-auditeur', 'Auditeur Test');
      await fonAuditCreer(); return DATA.audits_fonciers[DATA.audits_fonciers.length - 1];
    };
    window.__tout = async function (a, statut, sauf) {
      for (const d of FON_AUDIT_POINTS) { if (sauf && sauf[d.code]) continue; a.points[d.code] = { statut: statut, piece_ref: 'PIECE-' + d.code, observation: 'ok', valide_par: 'T', valide_le: '2026-01-01' }; }
      await fonRuralSauver('audits', a);
    };
    window.__visas = function (a) { a.visas = { suivi: { nom: 'A' }, juridique: { nom: 'B' }, dg: { nom: 'C' } }; };
  });
}
const T = (page, fn, arg) => page.evaluate(fn, arg);

test('référentiel : 19 points, 13 bloquants et 6 majeurs, codes uniques, pièce et émetteur renseignés', async () => {
  const app = await ouvrirApp();
  try {
    const r = await T(app.page, function () { return { n: FON_AUDIT_POINTS.length, b: FON_AUDIT_POINTS.filter(function (d) { return d.crit === 'bloquant'; }).length, u: new Set(FON_AUDIT_POINTS.map(function (d) { return d.code; })).size,
      vides: FON_AUDIT_POINTS.filter(function (d) { return !d.verif || !d.piece || !d.emetteur || !d.axe; }).length, axes: Array.from(new Set(FON_AUDIT_POINTS.map(function (d) { return d.axe; }))).length,
      majeurs: FON_AUDIT_POINTS.filter(function (d) { return d.crit === 'majeur'; }).map(function (d) { return d.code; }) }; });
    assert.equal(r.n, 19); assert.equal(r.b, 13); assert.equal(r.u, 19); assert.equal(r.vides, 0); assert.equal(r.axes, 4);
    assert.deepEqual(r.majeurs, ['AUD-COUT-05', 'AUD-TECH-03', 'AUD-TECH-04', 'AUD-TECH-05', 'AUD-FIN-02', 'AUD-FIN-04']);
  } finally { await app.fermer(); }
});

test('verdict : NO-GO, EN COURS, GO AVEC RÉSERVES, GO (un bloquant « en régularisation » ne vaut jamais GO)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __nouveau({}), niv = function () { return fonAuditVerdict(a).niveau; }, res = {};
      res.vierge = niv();
      await __tout(a, 'conforme'); res.go = niv();
      a.points['AUD-TECH-04'].statut = 'non_conforme'; res.reserves = niv(); a.points['AUD-TECH-04'].statut = 'en_regularisation'; res.reservesRegul = niv(); a.points['AUD-TECH-04'].statut = 'conforme';
      a.points['AUD-JUR-01'].statut = 'en_regularisation'; res.bloquantRegul = niv(); a.points['AUD-JUR-01'].statut = 'non_conforme'; res.nogo = niv();
      a.points['AUD-JUR-01'].statut = 'conforme'; a.points['AUD-TECH-05'].statut = 'a_verifier'; res.majeurAVerifier = niv();
      a.points['AUD-TECH-05'].statut = 'non_applicable'; a.points['AUD-JUR-05'].statut = 'non_applicable'; res.na = niv();
      return res;
    });
    assert.deepEqual(r, { vierge: 'en_cours', go: 'go', reserves: 'go_reserves', reservesRegul: 'go_reserves', bloquantRegul: 'en_cours', nogo: 'no_go', majeurAVerifier: 'en_cours', na: 'go' });
  } finally { await app.fermer(); }
});

test('création : opération déjà auditée refusée ; préremplissage depuis l\'opération ; 19 points à vérifier', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      DATA.af_operations = [{ id: 'op1', nom: 'OP-BING-01', commune: 'Bingerville', village: 'Akandjé', superficie: 125000, stage: 'prospection' }];
      fonAuditNouveau(); document.getElementById('fau-operation').value = 'op1'; fonAuditPreRemplir();
      const pre = { code: document.getElementById('fau-code').value, commune: document.getElementById('fau-commune').value, sup: document.getElementById('fau-superficie').value };
      document.getElementById('fau-auditeur').value = 'Chargé Foncier'; await fonAuditCreer(); const a = DATA.audits_fonciers[0];
      fonAuditNouveau(); document.getElementById('fau-operation').value = 'op1'; document.getElementById('fau-auditeur').value = 'X'; window.__toasts.length = 0; await fonAuditCreer();
      return { pre: pre, n: DATA.audits_fonciers.length, ref: a.reference, pts: Object.keys(a.points).length, tous: Object.keys(a.points).every(function (k) { return a.points[k].statut === 'a_verifier'; }), msg: window.__toasts.join('|') };
    });
    assert.deepEqual(r.pre, { code: 'OP-BING-01', commune: 'Bingerville', sup: '125000' }); assert.equal(r.n, 1); assert.match(r.ref, /^AUD-\d{4}-001$/); assert.equal(r.pts, 19); assert.equal(r.tous, true); assert.match(r.msg, /déjà un audit/);
  } finally { await app.fermer(); }
});

test('points : pièce obligatoire pour « conforme », motif pour non conforme / non applicable, N/A bloquant réservé à l\'admin, CF exigé en zone rurale, historique, validateur', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __nouveau({ zone: 'rural' }), id = a.id, o = {};
      o.sansPiece = await fonAuditPoint(id, 'AUD-JUR-01', 'statut', 'conforme');
      await fonAuditPoint(id, 'AUD-JUR-01', 'piece_ref', 'EF-2026-114'); o.avecPiece = await fonAuditPoint(id, 'AUD-JUR-01', 'statut', 'conforme');
      o.valide = { par: a.points['AUD-JUR-01'].valide_par, le: !!a.points['AUD-JUR-01'].valide_le };
      o.videPiece = await fonAuditPoint(id, 'AUD-JUR-01', 'piece_ref', '');
      o.ncSansMotif = await fonAuditPoint(id, 'AUD-JUR-02', 'statut', 'non_conforme'); await fonAuditPoint(id, 'AUD-JUR-02', 'observation', 'Zone mal classée'); o.ncAvecMotif = await fonAuditPoint(id, 'AUD-JUR-02', 'statut', 'non_conforme');
      await fonAuditPoint(id, 'AUD-COUT-01', 'observation', 'sans objet');
      const vraiAdmin = fcEstAdmin; fcEstAdmin = function () { return false; }; o.naNonAdmin = await fonAuditPoint(id, 'AUD-COUT-01', 'statut', 'non_applicable'); fcEstAdmin = vraiAdmin;
      o.naMajeur = await (async function () { await fonAuditPoint(id, 'AUD-TECH-05', 'observation', 'site déjà desservi'); return fonAuditPoint(id, 'AUD-TECH-05', 'statut', 'non_applicable'); })();
      await fonAuditPoint(id, 'AUD-JUR-05', 'observation', 'urbain'); o.naCfRural = await fonAuditPoint(id, 'AUD-JUR-05', 'statut', 'non_applicable');
      o.reapres = (await fonAuditPoint(id, 'AUD-JUR-01', 'statut', 'a_verifier'), a.points['AUD-JUR-01'].valide_par);
      o.histo = a.historique.map(function (h) { return h.code + ':' + h.de + '>' + h.vers; });
      return o;
    });
    assert.equal(r.sansPiece, false); assert.equal(r.avecPiece, true); assert.equal(r.valide.par.length > 0, true); assert.equal(r.valide.le, true); assert.equal(r.videPiece, false);
    assert.equal(r.ncSansMotif, false); assert.equal(r.ncAvecMotif, true); assert.equal(r.naNonAdmin, false); assert.equal(r.naMajeur, true); assert.equal(r.naCfRural, false);
    assert.deepEqual(r.histo, ['AUD-JUR-01:a_verifier>conforme', 'AUD-JUR-02:a_verifier>non_conforme', 'AUD-TECH-05:a_verifier>non_applicable', 'AUD-JUR-01:conforme>a_verifier']); assert.equal(r.reapres, '');
  } finally { await app.fermer(); }
});

test('décision : GO refusé tant que le verdict n\'est pas GO ou si un visa manque ; GO avec réserves motivé ; NO-GO motivé ; décision définitive', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __nouveau({}), id = a.id, o = {}; window.prompt = function () { return ''; };
      o.vierge = await fonAuditDecider(id, 'go');
      await __tout(a, 'conforme'); o.sansVisa = await fonAuditDecider(id, 'go');
      __visas(a); a.points['AUD-TECH-04'].statut = 'non_conforme'; window.prompt = function () { return ''; }; o.reservesSansMotif = await fonAuditDecider(id, 'go');
      window.prompt = function () { return 'Traiter le bas-fond avant les travaux'; }; o.reserves = await fonAuditDecider(id, 'go');
      o.decision = { d: a.decision, motif: a.decision_motif, verdict: a.verdict_au_moment };
      o.modif = await fonAuditPoint(id, 'AUD-JUR-01', 'statut', 'non_conforme'); o.redecider = await fonAuditDecider(id, 'no_go'); o.visa = await fonAuditVisa(id, 'dg', 'nom', 'Z');
      const b = await __nouveau({ code: 'OP-2' }); window.prompt = function () { return ''; }; o.nogoSansMotif = await fonAuditDecider(b.id, 'no_go'); window.prompt = function () { return 'TF existant sur la parcelle'; }; o.nogo = await fonAuditDecider(b.id, 'no_go'); o.nogoDec = b.decision;
      o.histo = a.historique.filter(function (h) { return h.code === 'DECISION'; }).length;
      return o;
    });
    assert.equal(r.vierge, false); assert.equal(r.sansVisa, false); assert.equal(r.reservesSansMotif, false); assert.equal(r.reserves, true);
    assert.deepEqual(r.decision, { d: 'go', motif: 'Traiter le bas-fond avant les travaux', verdict: 'go_reserves' }); assert.equal(r.modif, false); assert.equal(r.redecider, false); assert.equal(r.visa, false);
    assert.equal(r.nogoSansMotif, false); assert.equal(r.nogo, true); assert.equal(r.nogoDec, 'no_go'); assert.equal(r.histo, 1);
  } finally { await app.fermer(); }
});

test('opération : sortie de « Négociation » refusée sans audit GO, accordée avec ; dérogation administrateur motivée et journalisée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const base = function () { return { cle: { prop: 40, amen: 35, fin: 25 }, agent_id: '', proprietaires: [], documents: [], rencontres: [], litiges: [], demarches: [], postes_vrd: [] }; };
      DATA.af_operations = [Object.assign(base(), { id: 'op1', nom: 'OP-1', stage: 'negociation' }), Object.assign(base(), { id: 'op2', nom: 'OP-2', stage: 'prospection' })];
      const passer = async function (id, stage) { afOpenOperation(id); const sel = document.getElementById('af-op-stage'); if (!sel.querySelector('option[value="' + stage + '"]')) sel.innerHTML += '<option value="' + stage + '">' + stage + '</option>'; sel.value = stage; window.__toasts.length = 0; await afSaveOperation(); return { stage: DATA.af_operations.find(function (x) { return x.id === id; }).stage, msg: window.__toasts.join('|') }; };
      const o = {}, vraiAdmin = fcEstAdmin;
      fcEstAdmin = function () { return false; };
      o.sansAudit = await passer('op1', 'juridique');
      o.restePhase = (await passer('op2', 'negociation')).stage;          // prospection → négociation : libre
      const a = await __nouveau({ operation: 'op1' }); o.enCours = await passer('op1', 'juridique');
      await __tout(a, 'conforme'); __visas(a); await fonAuditDecider(a.id, 'go'); o.avecGo = await passer('op1', 'juridique');
      fcEstAdmin = vraiAdmin; o.pointFixe = (await passer('op1', 'admin')).stage;      // déjà au-delà : aucune porte
      const prevPrompt = window.prompt; window.prompt = function () { return 'Décision DG du 12/06'; }; o.admin = await passer('op2', 'amenagement'); window.prompt = prevPrompt;
      o.derog = DATA.af_operations.find(function (x) { return x.id === 'op2'; }).audit_derogation;
      DATA.params.fon_audit_obligatoire = false; DATA.af_operations.push(Object.assign(base(), { id: 'op3', nom: 'OP-3', stage: 'prospection' })); fcEstAdmin = function () { return false; }; o.coupe = await passer('op3', 'repartition');
      return o;
    });
    assert.equal(r.sansAudit.stage, 'negociation'); assert.match(r.sansAudit.msg, /Aucun audit foncier/); assert.equal(r.restePhase, 'negociation');
    assert.equal(r.enCours.stage, 'negociation'); assert.match(r.enCours.msg, /EN COURS D'AUDIT/); assert.equal(r.avecGo.stage, 'juridique'); assert.equal(r.pointFixe, 'admin');
    assert.equal(r.admin.stage, 'amenagement'); assert.equal(r.derog.motif, 'Décision DG du 12/06'); assert.equal(r.coupe.stage, 'repartition');
  } finally { await app.fermer(); }
});

test('indices ERP : opposition, certificat foncier, bornes, chevauchement, comité villageois, régime', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const sq = function (x, y, c) { return [{ x: x, y: y }, { x: x + c, y: y }, { x: x + c, y: y + c }, { x: x, y: y + c }]; };
      DATA.parcelles = [{ id: 'p1', ref: 'P-1', regime: 'rural', utm_zone: 30, bornes: sq(400000, 600000, 100) }, { id: 'p2', ref: 'P-2', regime: 'urbain', utm_zone: 30, bornes: sq(400050, 600050, 100) }];
      DATA.villages_fonciers = [{ id: 'v1', nom: 'Akandjé', comite: { membres: [{ nom: 'A' }, { nom: 'B' }] } }];
      const a = await __nouveau({ zone: 'rural', parcelle: 'p1', village: 'akandjé' });
      const avant = fonAuditIndices(a);
      DATA.oppositions_fonciers = [{ id: 'o1', parcelle_id: 'p1', statut: 'ouverte', reference: 'OPP-1' }]; DATA.titres_fonciers = [{ id: 't1', parcelle_id: 'p1', type: 'certificat_foncier' }];
      DATA.bornages_fonciers = [{ id: 'b1', parcelle_id: 'p1', statut: 'realise', pv_ref: 'PV', convocations: [{ nom: 'V', present: true }] }];
      const apres = fonAuditIndices(a), urbain = fonAuditIndices(Object.assign({}, a, { zone: 'urbain' }));
      const resume = function (h) { const o = {}; Object.keys(h).forEach(function (k) { o[k] = h[k].ok; }); return o; };
      return { avant: resume(avant), apres: resume(apres), jur02Urbain: urbain['AUD-JUR-02'].ok, jur05Urbain: urbain['AUD-JUR-05'].ok, chev: avant['AUD-TECH-02'].t };
    });
    assert.deepEqual(r.avant, { 'AUD-COUT-02': true, 'AUD-JUR-02': true, 'AUD-JUR-04': true, 'AUD-JUR-05': false, 'AUD-TECH-01': true, 'AUD-TECH-02': false, 'AUD-COUT-05': false });
    assert.deepEqual(r.apres, { 'AUD-COUT-02': true, 'AUD-JUR-02': true, 'AUD-JUR-04': false, 'AUD-JUR-05': true, 'AUD-TECH-01': true, 'AUD-TECH-02': false, 'AUD-COUT-05': true });
    assert.equal(r.jur02Urbain, false); assert.equal(r.jur05Urbain, null); assert.match(r.chev, /P-2/);
  } finally { await app.fermer(); }
});

test('export CSV (colonnes du modèle Excel), impression, écran liste et fiche sans erreur de page', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const a = await __nouveau({ code: 'OP-BING-01', village: 'Akandjé' }); await fonAuditPoint(a.id, 'AUD-JUR-01', 'piece_ref', 'EF-1'); await fonAuditPoint(a.id, 'AUD-JUR-01', 'statut', 'conforme');
      const lignes = fonAuditCsv(a).split('\n'), ent = lignes[0].replace('﻿', '');
      let html = ''; window.open = function () { return { document: { write: function (h) { html += h; }, close: function () {} } }; }; fonAuditImprimer(a.id);
      fonRuralVue('audits'); const liste = document.getElementById('fon-rural-liste').innerHTML; fonAuditOuvrir(a.id); const fiche = document.getElementById('fon-audit-corps').innerHTML;
      return { n: lignes.length, ent: ent, jur01: lignes.find(function (l) { return l.indexOf('AUD-JUR-01') !== -1; }), imprime: /AUD-FON-MENKO-02/.test(html) && /Signature & cachet/.test(html), liste: /OP-BING-01/.test(liste), fiche: /EN COURS D(&#39;|')AUDIT/.test(fiche) && fiche.split('AUD-').length > 19 };
    });
    assert.equal(r.n, 20); assert.equal(r.ent, '"code_point_controle";"axe_audit";"point_controle_verification";"piece_justificative_exigee";"administration_emetteur";"criticite";"statut_conformite";"reference_piece";"observations_reserves";"validateur_date"');
    assert.match(r.jur01, /"BLOQUANT \(NO-GO\)";"Conforme";"EF-1"/); assert.equal(r.imprime, true); assert.equal(r.liste, true); assert.equal(r.fiche, true); assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});
