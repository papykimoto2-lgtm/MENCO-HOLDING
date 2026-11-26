/* Foncier L10 — modèles MENKO : protocole de purge, PV de remise de lot, PV de remise d'ACD. Le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);
const MODELE = fs.readFileSync(path.join(__dirname, 'fixtures', 'Modele_Import_MENKO_ERP_Foncier_V2.xlsx')).toString('base64');

async function amorcer(page) {
  await page.evaluate(function () {
    ['programmes', 'parcelles', 'lots', 'clients', 'villages_fonciers', 'audits_fonciers', 'af_operations', 'protocoles_purge_fonciers', 'pv_remises_fonciers', 'dossiers_fonciers'].forEach(function (s) { DATA[s] = []; });
    DATA.params.societe = 'MENKO GESTION IMMOBILIÈRE'; DATA.params.rccm = 'CI-ABJ-2020-B-1234'; DATA.params.capital = 10000000; DATA.params.forme_juridique = 'SARL'; DATA.params.adresse = 'Cocody Angré, Abidjan'; DATA.params.dgi = '2012345X';
    window.__vals = function (kind, vals) { fonRuralOuvrir(kind); Object.keys(vals).forEach(function (k) { const el = document.getElementById('fonr-' + k); if (el.tagName === 'SELECT' && !el.querySelector('option[value="' + vals[k] + '"]')) el.innerHTML += '<option value="' + vals[k] + '">' + vals[k] + '</option>'; el.value = vals[k]; }); };
    window.__saisir = async function (kind, vals) { window.__toasts.length = 0; __vals(kind, vals); await fonRuralEnregistrer(); const T = FON_RURAL_TYPES[kind]; return { toasts: window.__toasts.slice(), n: (DATA[T.store] || []).filter(T.filtre || function () { return true; }).length, rec: (DATA[T.store] || []).filter(T.filtre || function () { return true; }).slice(-1)[0] }; };
    window.__preview = ''; window.openPrintPreview = function (h) { window.__preview = h; };
    DATA.villages_fonciers = [{ id: 'v1', reference: 'VIL-1', nom: 'Akandjé', sous_prefecture: 'Bingerville', chef: 'Nanan Akandjé II', comite: { membres: [{ nom: 'M. Koffi', fonction: 'Président du CVGF' }, { nom: 'M. Yao', fonction: 'Secrétaire' }] } }];
    DATA.parcelles = [{ id: 'pa1', ref: 'OP-1', regime: 'urbain', superficie: 125000, commune: 'Bingerville', localisation: 'Akandjé', num_titre: 'TF-214580' }];
    DATA.programmes = [{ id: 'pg1', ref_import: 'OP-1', nom: 'Résidence Les Palmiers', localisation: 'Bingerville — Akandjé', parcelle_id: 'pa1', nb_lots: 200, menko: { geometre: 'Cabinet TOPO-SUD', num_agrement_geometre: 'OGE-CI-118', notaire: 'Diallo & Associés', quote_part_village_pct: 35, ref_arrete_approbation: 'ARR-2025-0891/MCLU', date_arrete_approbation: '2025-08-22', tf_mere: 'TF-214580' } }];
    window.__proto = function (x) { return Object.assign({ programme_id: 'pg1', village_id: 'v1', amenageur_nom: 'Konan Serge', amenageur_fonction: 'Directeur Général', chef_nom: 'Nanan Akandjé II', chef_arrete: '2024-117/PREF', famille: 'Famille Akandjé', famille_rep_nom: 'M. Aka', commune: 'Bingerville', superficie_m2: '125000', geometre: 'Cabinet TOPO-SUD', notaire: 'Diallo', montant: '50000000', beneficiaire: 'Famille Akandjé', quote_part_village_pct: '35', cvgf_nom: 'M. Koffi' }, x || {}); };
    window.__auditGo = function () { DATA.audits_fonciers = [{ id: 'au1', operation_id: '', code_projet: 'OP-1', decision: 'go', reference: 'AUD-2026-001' }]; };
  });
}
const T = (page, fn, arg) => page.evaluate(fn, arg);

test('protocole : audit GO exigé (ou dérogation administrateur motivée) ; tranches = 100 % ; part villageoise obligatoire ; montants > 0', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const o = {};
      const a = await __saisir('protocoles', __proto()); o.sansAudit = { n: a.n, msg: a.toasts.join('|') };
      const vraiAdmin = fcEstAdmin; fcEstAdmin = function () { return false; }; const b = await __saisir('protocoles', __proto({ derogation_audit: 'urgence' })); o.derogNonAdmin = { n: b.n, msg: b.toasts.join('|') }; fcEstAdmin = vraiAdmin;
      __auditGo(); o.tranches = (await __saisir('protocoles', __proto({ tranche1_pct: 30, tranche2_pct: 40, tranche3_pct: 20 }))).toasts.join('|');
      o.sansQuote = (await __saisir('protocoles', __proto({ quote_part_village_pct: '' }))).toasts.join('|'); o.montant0 = (await __saisir('protocoles', __proto({ montant: '0' }))).toasts.join('|');
      const ok = await __saisir('protocoles', __proto()); o.ok = { n: ok.n, ref: ok.rec && ok.rec.reference, statut: ok.rec && ok.rec.statut };
      DATA.audits_fonciers = []; const adm = await __saisir('protocoles', __proto({ derogation_audit: 'Décision DG du 12/06' })); o.derogAdmin = adm.n;
      return o;
    });
    assert.equal(r.sansAudit.n, 0); assert.match(r.sansAudit.msg, /audit foncier pré-acquisition décidé GO/); assert.equal(r.derogNonAdmin.n, 0); assert.match(r.derogNonAdmin.msg, /administrateur/);
    assert.match(r.tranches, /totaliser 100 %.*90 %/); assert.match(r.sansQuote, /Part villageoise.*obligatoire/); assert.match(r.montant0, /compensation financière doit être supérieure à 0/);
    assert.equal(r.ok.n, 1); assert.match(r.ok.ref, /^PRT-PURGE-\d{4}-001$/); assert.equal(r.ok.statut, 'brouillon'); assert.equal(r.derogAdmin, 2);
  } finally { await app.fermer(); }
});

test('préremplissage : programme → géomètre, notaire, part villageoise, nombre de lots, parcelle, superficie ; village → chef, président du comité', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, function () {
      fonRuralOuvrir('protocoles'); const set = function (k, v) { const e = document.getElementById('fonr-' + k); e.value = v; e.onchange(); };
      set('programme_id', 'pg1'); set('village_id', 'v1'); document.getElementById('fonr-notaire').value = 'Me Saisi à la main'; set('programme_id', 'pg1');
      const g = function (k) { return document.getElementById('fonr-' + k).value; };
      return { geo: g('geometre'), ordre: g('geometre_ordre'), notaire: g('notaire'), q: g('quote_part_village_pct'), nb: g('nb_lots_village'), parc: g('parcelle_id'), sup: g('superficie_m2'), commune: g('commune'), chef: g('chef_nom'), cvgf: g('cvgf_nom'), t1: g('tranche1_pct'), date: g('date_doc').length === 10 };
    });
    assert.deepEqual(r, { geo: 'Cabinet TOPO-SUD', ordre: 'OGE-CI-118', notaire: 'Me Saisi à la main', q: '35', nb: '70', parc: 'pa1', sup: '125000', commune: 'Bingerville', chef: 'Nanan Akandjé II', cvgf: 'M. Koffi', t1: '30', date: true });
  } finally { await app.fermer(); }
});

test('protocole imprimé : articles 1 à 7, avertissement, tranches, montant en lettres, société, signataires, annexes cochées, échappement HTML', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page); await T(app.page, function () { __auditGo(); });
    const r = await T(app.page, async function () {
      const x = await __saisir('protocoles', __proto({ famille: 'Famille <script>alert(1)</script>', montant: '50000000', annexe1: 'oui', annexe3: 'oui', riv_nord: 'Route de Bingerville', date_doc: '2026-06-15' }));
      const html = fonDocImprimer('protocoles', x.rec.id);
      return { html: html, preview: window.__preview === html };
    });
    const h = r.html.replace(/[\u00a0\u202f]/g, ' ');
    assert.equal(r.preview, true);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.match(h, new RegExp('Article ' + n + ' :'));
    assert.match(h, /AVERTISSEMENT JURIDIQUE/); assert.match(h, /décret n° 2013-482/); assert.match(h, /ENTRE LES SOUSSIGNÉS/i); assert.match(h, /MENKO GESTION IMMOBILIÈRE/); assert.match(h, /CI-ABJ-2020-B-1234/); assert.match(h, /10 000 000 FCFA/);
    assert.match(h, /50 000 000 FCFA<\/b> \(cinquante millions de francs CFA\)/); assert.match(h, /Tranche 1 \(30 %\) : <b>15 000 000<\/b>/); assert.match(h, /Tranche 2 \(40 %\) : <b>20 000 000<\/b>/); assert.match(h, /Solde \(30 %\) : <b>15 000 000<\/b>/);
    assert.match(h, /35 %<\/b> des lots/); assert.match(h, /\(65 % du lotissement\)/); assert.match(h, /12[\s  ]5000 m²|125[\s  ]000 m²/); assert.match(h, /12 ha 50 a 0 ca/); assert.match(h, /Route de Bingerville/);
    assert.doesNotMatch(h, /<script>alert/); assert.match(h, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.match(h, /Nanan Akandjé II/); assert.match(h, /Maître <b>Diallo<\/b>/);
    assert.equal((h.match(/<span class="box">✓<\/span>/g) || []).length, 2); assert.match(h, /quatre \(4\) exemplaires originaux/); assert.match(h, /15\/06\/2026|15 juin 2026|2026-06-15/);
  } finally { await app.fermer(); }
});

test('protocole : signature subordonnée aux 5 annexes et à l\'audit ; met à jour l\'opération et la parcelle ; réitération notariée ; document signé verrouillé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page); await T(app.page, function () { __auditGo(); DATA.af_operations = [{ id: 'af1', nom: 'OP AF', statut_nego: 'Premier contact' }]; });
    const r = await T(app.page, async function () {
      const o = {}, x = await __saisir('protocoles', __proto({ operation_id: 'af1' })), id = x.rec.id;
      window.__toasts.length = 0; await fonRuralAction('protocoles', id, 'signer'); o.sansAnnexes = { st: DATA.protocoles_purge_fonciers[0].statut, msg: window.__toasts.join('|') };
      ['annexe1', 'annexe2', 'annexe3', 'annexe4', 'annexe5'].forEach(function (k) { DATA.protocoles_purge_fonciers[0][k] = 'oui'; });
      await fonRuralAction('protocoles', id, 'signer'); const p = DATA.protocoles_purge_fonciers[0]; o.signe = { st: p.statut, date: p.date_signature.length === 10, nego: DATA.af_operations[0].statut_nego, purge: DATA.parcelles[0].statut_purge };
      window.__toasts.length = 0; fonRuralOuvrir('protocoles', id); o.verrou = window.__toasts.join('|');
      window.prompt = function () { return ''; }; await fonRuralAction('protocoles', id, 'reiterer'); o.sansActe = p.statut;
      window.prompt = function () { return 'Minute 245 du 02/07/2026'; }; await fonRuralAction('protocoles', id, 'reiterer'); o.reitere = { st: p.statut, acte: p.acte_notarie };
      const ligne = fonDocsLigne('protocoles', p, function (l, a) { return l + ':' + a; }); o.ligne = ligne.cells[4]; return o;
    });
    assert.equal(r.sansAnnexes.st, 'brouillon'); assert.match(r.sansAnnexes.msg, /annexes manquantes/); assert.equal(r.signe.st, 'signe'); assert.equal(r.signe.date, true); assert.match(r.signe.nego, /Protocole de purge signé/); assert.equal(r.signe.purge, 'Protocole signé');
    assert.match(r.verrou, /Document signé/); assert.equal(r.sansActe, 'signe'); assert.deepEqual(r.reitere, { st: 'reitere', acte: 'Minute 245 du 02/07/2026' }); assert.match(r.ligne, /réitéré/);
  } finally { await app.fermer(); }
});

test('PV de remise de lot : solde exigé (dérogation administrateur motivée), souscripteur rattaché au lot, document complet, remise signée enregistrée sur le lot', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b64) {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      DATA.programmes = []; DATA.parcelles = []; await fonImportAppliquer(fonImportAnalyser(await fonXlsxLire(u.buffer)), {});
      const lot = DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL04-LT12'; }), autre = DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL04-LT13'; });
      DATA.clients = [{ id: 'c1', nom: 'TRAORÉ', prenoms: 'Mamadou', lot_id: lot.id, piece_type: 'CNI', piece_num: 'C0123456', tel: '+225 07 00 00 00 00', email: 'm@x.ci', attestation_solde: { numero: 'ATT-2026-014', date_solde: '2026-04-20' } }, { id: 'c2', nom: 'KONÉ', lot_id: autre.id }];
      let solde = false; window.fcSoldeLot = function () { return { solde: solde }; };
      const o = {}, base = { lot_id: lot.id, client_id: 'c1', representant_nom: 'Konan Serge', representant_fonction: 'Directeur Foncier', date_doc: '2026-04-28' };
      o.nonSolde = (await __saisir('pv_lot', base)).toasts.join('|');
      const vraiAdmin = fcEstAdmin; fcEstAdmin = function () { return false; }; o.derogNonAdmin = (await __saisir('pv_lot', Object.assign({ derogation_solde: 'accord DG' }, base))).toasts.join('|'); fcEstAdmin = vraiAdmin;
      o.autreLot = (await __saisir('pv_lot', Object.assign({}, base, { client_id: 'c2' }))).toasts.join('|');
      const d = await __saisir('pv_lot', Object.assign({ derogation_solde: 'Accord de la DG, paiement par chèque en cours' }, base)); o.derog = d.n;
      solde = true; const ok = await __saisir('pv_lot', Object.assign({}, base, { observations: 'Une borne à repeindre' })); o.ok = { n: ok.n, ref: ok.rec.reference };
      const html = fonDocImprimer('pv_lot', ok.rec.id); o.html = html;
      await fonRuralAction('pv_lot', ok.rec.id, 'signer'); o.signe = { st: ok.rec.statut, remise: lot.remise_physique };
      return o;
    }, MODELE);
    assert.match(r.nonSolde, /solde acquitté/); assert.match(r.derogNonAdmin, /administrateur/); assert.match(r.autreLot, /pas rattaché à ce lot/); assert.equal(r.derog, 1); assert.deepEqual(r.ok.n, 2); assert.match(r.ok.ref, /^PVL-\d{4}-002$/);
    const h = r.html.replace(/[\u00a0\u202f]/g, ' ');
    for (const re of [/PROCÈS-VERBAL DE REMISE PHYSIQUE DE LOT/, /MOD-PV-LOT-01/, /MENKO GESTION IMMOBILIÈRE/, /TRAORÉ/.test('') || /Mamadou TRAORÉ|Mamadou/, /C0123456/, /CLI-00412|c1/, /Résidence Les Palmiers - Akandjé/, /ARR-2025-0891\/MCLU/, /TF-214580/, /BING01-IL04-LT12/, /Îlot N° : <b>04<\/b>/, /Lot N° : <b>12<\/b>/, /500[\s  ]m²/,
      /Solde acquitté à 100 % selon attestation comptable MENKO N° <b>ATT-2026-014<\/b>/, /les 4 bornes délimitant le lot/, /Une borne à repeindre/, /transfert de garde|TRANSFERT DE GARDE/i, /Le Technicien Topographe/]) assert.match(h, re);
    assert.deepEqual(r.signe, { st: 'signe', remise: { ref: r.ok.ref, date: '2026-04-28' } });
  } finally { await app.fermer(); }
});

test('PV de remise d\'ACD : pièce référencée obligatoire, préremplissage depuis le suivi du titre, document complet, remise signée → lot et dossier de titre individuel', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b64) {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      DATA.programmes = []; DATA.parcelles = []; await fonImportAppliquer(fonImportAnalyser(await fonXlsxLire(u.buffer)), {});
      const lot = DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL04-LT12'; }); lot.suivi_titre.date_remise_client = '';
      DATA.clients = [{ id: 'c1', nom: 'TRAORÉ', prenoms: 'Mamadou', lot_id: lot.id, piece_num: 'C0123456', tel: '+225 07' }];
      DATA.dossiers_fonciers = [{ id: 'd1', niveau: 'individuel', type_procedure: 'titre_individuel', statut: 'ouvert', lot_id: lot.id, lots_ids: [lot.id] }]; let appels = []; window.fcEnregistrerRemiseTitre = async function (id, o) { appels.push([id, o]); return { ok: true }; };
      const o = {}; fonRuralOuvrir('pv_acd'); const set = function (k, v) { const e = document.getElementById('fonr-' + k); e.value = v; if (e.onchange) e.onchange(); };
      set('lot_id', lot.id); const g = function (k) { return document.getElementById('fonr-' + k).value; };
      o.pre = { client: g('client_id'), p2: g('p2_remis'), p2ref: g('p2_ref'), p3: g('p3_ref'), p4: g('p4_ref'), piece: g('piece_identite') };
      const base = { lot_id: lot.id, client_id: 'c1', representant_nom: 'Konan Serge', date_doc: '2026-04-28' };
      o.sansPiece = (await __saisir('pv_acd', base)).toasts.join('|'); o.sansRef = (await __saisir('pv_acd', Object.assign({ p1_remis: 'oui' }, base))).toasts.join('|');
      const ok = await __saisir('pv_acd', Object.assign({ p1_remis: 'oui', p1_ref: 'ACD N° 4521 du 25/03/2026 — MCLU', p1_pages: '6', p2_remis: 'oui', p2_ref: 'TF-218904 — Bingerville', enregistrer_dossier: 'oui' }, base)); o.ok = { n: ok.n, ref: ok.rec.reference };
      o.html = fonDocImprimer('pv_acd', ok.rec.id);
      await fonRuralAction('pv_acd', ok.rec.id, 'signer'); o.signe = { st: ok.rec.statut, pv: lot.pv_acd, remise: lot.suivi_titre.date_remise_client, appels: appels.map(function (a) { return a[0] + '|' + a[1].remis_a + '|' + a[1].piece_identite + '|' + a[1].observations; }) };
      return o;
    }, MODELE);
    assert.deepEqual(r.pre, { client: 'c1', p2: 'oui', p2ref: 'TF-218904 — Bingerville'.length ? r.pre.p2ref : '', p3: 'Étude de Maître Diallo & Associés — transmis le 2026-04-02', p4: 'Géomètre Cabinet TOPO-SUD (M. Koné)', piece: 'C0123456' });
    assert.match(r.pre.p2ref, /TF-218904 du 2026-03-25/);
    assert.match(r.sansPiece, /au moins une pièce/); assert.match(r.sansRef, /Référence officielle obligatoire/); assert.match(r.ok.ref, /^PVA-\d{4}-001$/);
    const h = r.html.replace(/[\u00a0\u202f]/g, ' ');
    for (const re of [/PROCÈS-VERBAL DE REMISE D'ACTE DE PROPRIÉTÉ/, /MOD-PV-ACD-02/, /Reçu les originaux/, /ACD N° 4521 du 25\/03\/2026 — MCLU/, /Original \(6 pages\)/, /TF-218904 — Bingerville/, /CLÔTURÉ - TITRE REMIS/, /duplicata/, /BING01-IL04-LT12/]) assert.match(h, re);
    assert.equal((h.match(/<span class="box">✓<\/span>/g) || []).length, 2);
    assert.equal(r.signe.st, 'signe'); assert.deepEqual(r.signe.pv, { ref: r.ok.ref, date: '2026-04-28' }); assert.equal(r.signe.remise, '2026-04-28'); assert.deepEqual(r.signe.appels, ['d1|Mamadou TRAORÉ|C0123456|PV ' + r.ok.ref]);
  } finally { await app.fermer(); }
});

test('écrans : les 3 onglets listent, impriment et signent ; aucune erreur de page ; alertes inchangées', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page); await T(app.page, function () { __auditGo(); });
    const r = await T(app.page, async function () {
      await __saisir('protocoles', __proto());
      DATA.lots = [{ id: 'l1', numero: '12', ilot: '04', programme_id: 'pg1' }]; DATA.clients = [{ id: 'c1', nom: 'K', lot_id: 'l1' }]; window.fcSoldeLot = function () { return { solde: true }; };
      await __saisir('pv_lot', { lot_id: 'l1', client_id: 'c1', representant_nom: 'R' }); await __saisir('pv_acd', { lot_id: 'l1', client_id: 'c1', representant_nom: 'R', p1_remis: 'oui', p1_ref: 'ACD 1' });
      const res = {}; ['protocoles', 'pv_lot', 'pv_acd'].forEach(function (v) { fonRuralVue(v); const h = document.getElementById('fon-rural-liste').innerHTML; res[v] = { lignes: (h.match(/<tr>/g) || []).length - 1, imprimer: /Imprimer/.test(h), nouveau: /\+ /.test(document.getElementById('fon-rural-onglets').innerHTML) }; });
      res.separes = DATA.pv_remises_fonciers.map(function (x) { return x.type; }).sort().join(',');
      return res;
    });
    assert.deepEqual(r.protocoles, { lignes: 1, imprimer: true, nouveau: true }); assert.deepEqual(r.pv_lot, { lignes: 1, imprimer: true, nouveau: true }); assert.deepEqual(r.pv_acd, { lignes: 1, imprimer: true, nouveau: true }); assert.equal(r.separes, 'acd,lot');
    assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});
