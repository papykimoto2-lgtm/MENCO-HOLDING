/* Foncier L9 — import Excel « MENKO ERP Foncier V2 » : lecteur .xlsx, contrôles, écriture idempotente. Le VRAI ERP (Chromium), le VRAI modèle fourni. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);
const b64 = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
const MODELE = b64('Modele_Import_MENKO_ERP_Foncier_V2.xlsx');

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.programmes = []; DATA.parcelles = []; DATA.lots = []; DATA.clients = []; DATA.titres_fonciers = [];
    window.__buf = function (b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    window.__lire = async function (b64) { return fonXlsxLire(__buf(b64)); };
    /* Classeur fabriqué : en-têtes techniques + une ligne de libellés + données */
    window.__fab = function (o) {
      const feuille = function (nom, cle, entetes, lignes) { return [entetes, ['ID ' + cle].concat(entetes.slice(1).map(function (e) { return e.toUpperCase(); }))].concat(lignes.map(function (l) { return entetes.map(function (e) { return l[e] === undefined ? '' : l[e]; }); })); };
      const E = { op: ['id_operation', 'nom_programme', 'commune_localite', 'village_concerne', 'statut_purge_coutumiere', 'ref_guide_villageois', 'urbaniste_agree', 'num_agrement_urbaniste', 'date_depot_plan_lotissement', 'date_enquete_commodo', 'ref_arrete_approbation', 'date_arrete_approbation', 'geometre_agree', 'num_agrement_geometre', 'num_tf_mere', 'superficie_totale_m2', 'quote_part_amenageur_pct', 'quote_part_village_pct', 'notaire_operation'],
        lot: ['id_lot_menko', 'id_operation', 'num_ilot', 'num_lot', 'superficie_m2', 'affectation_urbanisme', 'origine_propriete', 'statut_commercial', 'statut_juridique_lot', 'num_tf_parcellaire', 'code_client_menko', 'nom_acquereur', 'prix_cession_fcfa', 'taux_encaissement_pct', 'eligible_morcellement', 'coordonnees_utm_x', 'coordonnees_utm_y', 'observations_terrain'],
        wf: ['id_dossier_menko', 'id_lot_menko', 'type_procedure', 'urbaniste_validation_plan', 'date_visa_urbaniste', 'geometre_dossier_tech', 'date_visa_geometre', 'num_recepisse_guf', 'date_depot_guf', 'statut_instruction_mclu', 'date_bornage_cadastre', 'date_publication_jo', 'date_creation_tf_acd', 'num_titre_final', 'notaire_transmission_date', 'date_remise_client', 'motif_blocage', 'commentaire_suivi'] };
      const f = {}; f.MENKO_OPERATIONS = feuille('', 'Opération', E.op, o.ops || []); f.MENKO_LOTS = feuille('', 'Lot', E.lot, o.lots || []); f.MENKO_WORKFLOW_DOSSIERS = feuille('', 'Dossier', E.wf, o.wf || []);
      return { feuilles: f };
    };
    window.__op = function (x) { return Object.assign({ id_operation: 'OP-1', nom_programme: 'Résidence Test', commune_localite: 'Bingerville', village_concerne: 'Akandjé', statut_purge_coutumiere: 'En cours', superficie_totale_m2: 10000, quote_part_amenageur_pct: 60, quote_part_village_pct: 40 }, x || {}); };
    window.__lot = function (x) { return Object.assign({ id_lot_menko: 'L1', id_operation: 'OP-1', num_ilot: '01', num_lot: '01', superficie_m2: 500, affectation_urbanisme: 'Habitation Individuelle', origine_propriete: 'Part Aménageur', statut_commercial: 'Disponible', statut_juridique_lot: 'Parcelle Brute' }, x || {}); };
    window.__msgs = function (R, niveau) { return R.problemes.filter(function (p) { return !niveau || p.niveau === niveau; }).map(function (p) { return p.feuille.replace('MENKO_', '') + ':' + p.ligne + ':' + p.champ + ':' + p.msg; }); };
  });
}
const T = (page, fn, arg) => page.evaluate(fn, arg);

test('lecteur .xlsx : parties compressées ou non, chaînes partagées (texte riche), texte direct, dates Excel → AAAA-MM-JJ, booléens, chemins absolus', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) { const c = await __lire(b); return { noms: Object.keys(c.feuilles), a: c.feuilles['Feuille A'], b: c.feuilles['B'] }; }, b64('lecteur_partages_dates.xlsx'));
    assert.deepEqual(r.noms, ['Feuille A', 'B']);
    assert.deepEqual(r.a[0].slice(0, 4), ['Bonjour', '', 'Akandjé', 'Ligne\ndeux']);
    assert.deepEqual(r.a[2].slice(0, 6), ['2026-01-01', '2023-03-15', 125.5, 'VRAI', 'texte direct', 42]);
    assert.deepEqual(r.b[0], ['', 'formule']);
  } finally { await app.fermer(); }
});

test('lecteur .xlsx : le vrai modèle MENKO V2 (4 feuilles) est lu ; un fichier qui n\'est pas un classeur est refusé proprement', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) {
      const c = await __lire(b); let err = '', err2 = '';
      try { await fonXlsxLire(new TextEncoder().encode('ceci n\'est pas un classeur '.repeat(20)).buffer); } catch (e) { err = e.message; }
      try { const u = new Uint8Array(__buf(b)); u[0] = 0; u[u.length - 22] = 0; await fonXlsxLire(u.buffer); } catch (e) { err2 = e.message; }
      return { noms: Object.keys(c.feuilles), op: c.feuilles.MENKO_OPERATIONS[2].slice(0, 2), lots: c.feuilles.MENKO_LOTS.length, err: err, err2: err2 };
    }, MODELE);
    assert.deepEqual(r.noms, ['MENKO_OPERATIONS', 'MENKO_LOTS', 'MENKO_WORKFLOW_DOSSIERS', 'REFERENTIEL_LISTES_MENKO']); assert.deepEqual(r.op, ['OP-BING-01', 'Résidence Les Palmiers - Akandjé']); assert.equal(r.lots, 5);
    assert.match(r.err, /pas un classeur Excel/); assert.match(r.err2, /pas un classeur Excel/);
  } finally { await app.fermer(); }
});

test('analyse du vrai modèle : 2 opérations, 3 lots, 2 suivis, aucun problème, 1 vente à rattacher', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) { const R = fonImportAnalyser(await __lire(b)); return { s: R.stats, pb: R.problemes.length, ventes: R.ventes.map(function (l) { return l.id_lot_menko; }) }; }, MODELE);
    assert.deepEqual(r.s.operations, { total: 2, erreurs: 0, valides: 2, creations: 2, maj: 0 }); assert.deepEqual(r.s.lots, { total: 3, erreurs: 0, valides: 3, creations: 3, maj: 0 }); assert.deepEqual(r.s.workflow, { total: 2, erreurs: 0, valides: 2, creations: 2, maj: 0 });
    assert.equal(r.pb, 0); assert.deepEqual(r.ventes, ['BING01-IL04-LT12']);
  } finally { await app.fermer(); }
});

test('contrôles des opérations : doublon, quotes-parts ≠ 100 %, liste, date invalide, chronologie, lots au-delà de la superficie', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, function () {
      const R = fonImportAnalyser(__fab({ ops: [__op(), __op({ nom_programme: 'Doublon' }), __op({ id_operation: 'OP-2', quote_part_village_pct: 30 }), __op({ id_operation: 'OP-3', statut_purge_coutumiere: 'Presque finie' }),
        __op({ id_operation: 'OP-4', date_depot_plan_lotissement: '2026-02-30' }), __op({ id_operation: 'OP-5', date_depot_plan_lotissement: '2026-03-10', date_enquete_commodo: '2026-01-05' }), __op({ id_operation: 'OP-6', superficie_totale_m2: 0 }), __op({ id_operation: 'OP-7', superficie_totale_m2: 1000 })],
        lots: [__lot({ id_lot_menko: 'A1', id_operation: 'OP-7', superficie_m2: 700 }), __lot({ id_lot_menko: 'A2', id_operation: 'OP-7', num_lot: '02', superficie_m2: 700 })] }));
      return { e: __msgs(R, 'erreur'), w: __msgs(R, 'avertissement'), ops: R.stats.operations, lots: R.stats.lots };
    });
    const has = (a, re) => a.some((x) => re.test(x));
    assert.ok(has(r.e, /OPERATIONS:4:id_operation:Identifiant en double/)); assert.ok(has(r.e, /OPERATIONS:5:quote_part:.*90 %/)); assert.ok(has(r.e, /OPERATIONS:6:statut_purge_coutumiere:.*hors liste/));
    assert.ok(has(r.e, /OPERATIONS:7:date_depot_plan_lotissement:Date invalide/)); assert.ok(has(r.e, /OPERATIONS:9:superficie_totale_m2:.*obligatoire/)); assert.ok(has(r.e, /OPERATIONS:10:superficie_totale_m2:.*1400 m².*au-delà/));
    assert.ok(has(r.w, /OPERATIONS:8:date_enquete_commodo:.*antérieure au dépôt/)); assert.equal(r.ops.erreurs, 6); assert.equal(r.ops.valides, 2);
    assert.equal(r.lots.erreurs, 2);                       /* les lots d'une opération en erreur ne sont pas importables */
  } finally { await app.fermer(); }
});

test('contrôles des lots : opération inconnue, doublon îlot/lot, UTM hors Côte d\'Ivoire, non commercialisable « vendu », vendu sans acquéreur ni prix, éligibilité, taux', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, function () {
      const R = fonImportAnalyser(__fab({ ops: [__op()], lots: [__lot(), __lot({ id_lot_menko: 'L2', num_lot: '01' }), __lot({ id_lot_menko: 'L3', id_operation: 'OP-X', num_lot: '03' }), __lot({ id_lot_menko: 'L4', num_lot: '04', coordonnees_utm_x: 12, coordonnees_utm_y: 593210 }),
        __lot({ id_lot_menko: 'L5', num_lot: '05', origine_propriete: 'Part Villageoise', statut_commercial: 'Vendu', nom_acquereur: 'X', prix_cession_fcfa: 100 }), __lot({ id_lot_menko: 'L6', num_lot: '06', statut_commercial: 'Vendu' }),
        __lot({ id_lot_menko: 'L7', num_lot: '07', eligible_morcellement: 'Oui', taux_encaissement_pct: 20 }), __lot({ id_lot_menko: 'L8', num_lot: '08', taux_encaissement_pct: 130 }), __lot({ id_lot_menko: 'L9', num_lot: '09', statut_commercial: 'En vente' }),
        __lot({ id_lot_menko: 'L10', num_lot: '10', statut_commercial: 'Vendu', nom_acquereur: 'M. Test', prix_cession_fcfa: '18 500 000', taux_encaissement_pct: '65,5', coordonnees_utm_x: '398452,12', coordonnees_utm_y: 593210.45 })] }));
      return { e: __msgs(R, 'erreur'), w: __msgs(R, 'avertissement'), l: R.lots.map(function (x) { return x.id_lot_menko + ':' + (x._erreur ? 'KO' : 'ok'); }) };
    });
    const has = (a, re) => a.some((x) => re.test(x));
    assert.ok(has(r.e, /LOTS:4:num_lot:.*en double/)); assert.ok(has(r.e, /LOTS:5:id_operation:.*OP-X.*introuvable/)); assert.ok(has(r.e, /LOTS:6:coordonnees_utm:.*hors de la Côte d'Ivoire/)); assert.ok(has(r.e, /LOTS:7:statut_commercial:.*non commercialisable.*Vendu/));
    assert.ok(has(r.e, /LOTS:8:nom_acquereur:.*sans acquéreur/)); assert.ok(has(r.e, /LOTS:8:prix_cession_fcfa:.*sans prix/)); assert.ok(has(r.e, /LOTS:10:taux_encaissement_pct:.*0 à 100/)); assert.ok(has(r.e, /LOTS:11:statut_commercial:.*hors liste/));
    assert.ok(has(r.w, /LOTS:9:eligible_morcellement:.*< 30 %/)); assert.ok(has(r.w, /LOTS:8:code_client_menko:/));
    assert.ok(r.l.includes('L10:ok') && r.l.includes('L1:ok') && r.l.includes('L7:ok') && r.l.includes('L5:KO'));       /* prix « 18 500 000 », taux « 65,5 », UTM « 398452,12 » : formats français acceptés */
  } finally { await app.fermer(); }
});

test('contrôles des suivis : lot inconnu, remise sans titre, listes, un seul suivi par lot, chronologie et GUF en avertissement', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, function () {
      const R = fonImportAnalyser(__fab({ ops: [__op()], lots: [__lot(), __lot({ id_lot_menko: 'L2', num_lot: '02' })],
        wf: [{ id_dossier_menko: 'D1', id_lot_menko: 'L1', type_procedure: 'Morcellement TF + Mutation', date_visa_urbaniste: '2026-03-01', date_visa_geometre: '2026-02-01', date_depot_guf: '2026-04-01', statut_instruction_mclu: "En cours d’instruction", motif_blocage: 'Aucun blocage' },
          { id_dossier_menko: 'D2', id_lot_menko: 'L1', type_procedure: 'X' }, { id_dossier_menko: 'D3', id_lot_menko: 'L9', type_procedure: 'X' }, { id_dossier_menko: 'D4', id_lot_menko: 'L2', type_procedure: 'X', date_remise_client: '2026-05-01' },
          { id_dossier_menko: 'D5', id_lot_menko: 'L2', type_procedure: '', motif_blocage: 'Mauvais temps' }, { id_dossier_menko: 'D6', id_lot_menko: 'L1', type_procedure: 'X', date_remise_client: '15/05/2026', num_titre_final: 'TF-1' }] }));
      return { e: __msgs(R, 'erreur'), w: __msgs(R, 'avertissement'), wf: R.workflow.map(function (x) { return x.id_dossier_menko + ':' + (x._erreur ? 'KO' : 'ok'); }), mclu: R.workflow[0]._mclu, rem: R.workflow[5]._date_remise_client };
    });
    const has = (a, re) => a.some((x) => re.test(x));
    assert.equal(r.mclu, "En cours d'instruction");            /* apostrophe typographique reconnue */
    assert.ok(has(r.e, /WORKFLOW_DOSSIERS:4:id_lot_menko:Un seul dossier/)); assert.ok(has(r.e, /WORKFLOW_DOSSIERS:5:id_lot_menko:.*L9.*introuvable/)); assert.ok(has(r.e, /WORKFLOW_DOSSIERS:6:num_titre_final:Remise au client sans titre final/));
    assert.ok(has(r.e, /WORKFLOW_DOSSIERS:7:type_procedure:.*obligatoire/)); assert.ok(has(r.e, /WORKFLOW_DOSSIERS:7:motif_blocage:.*hors liste/));
    assert.ok(has(r.w, /WORKFLOW_DOSSIERS:3:date_visa_geometre:.*antérieure à visa de l'urbaniste/)); assert.ok(has(r.w, /WORKFLOW_DOSSIERS:3:num_recepisse_guf:/)); assert.equal(r.rem, '2026-05-15');
    assert.ok(r.wf.includes('D1:ok') && r.wf.includes('D4:KO') && r.wf.includes('D6:KO'));       /* D6 : même lot que D1 */
  } finally { await app.fermer(); }
});

test('import du vrai modèle : programmes, parcelles mères, titre mère, lots (vendu → réservé à rattacher), suivis ; statuts et liens corrects', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) {
      const R = fonImportAnalyser(await __lire(b)), res = await fonImportAppliquer(R, {});
      const lot = function (ref) { return DATA.lots.find(function (l) { return l.ref_import === ref; }); }, pr = DATA.programmes.find(function (p) { return p.ref_import === 'OP-BING-01'; }), pa = DATA.parcelles.find(function (p) { return p.ref === 'OP-BING-01'; }), pa2 = DATA.parcelles.find(function (p) { return p.ref === 'OP-SONG-02'; });
      const l12 = lot('BING01-IL04-LT12'), l13 = lot('BING01-IL04-LT13'), l1 = lot('BING01-IL01-LT01');
      return { res: { p: res.programmes, pa: res.parcelles, t: res.titres, l: res.lots, s: res.suivis, v: res.ventes, i: res.ignorees },
        prog: { nom: pr.nom, loc: pr.localisation, nature: pr.nature, nb: pr.nb_lots, par: pr.parcelle_id === pa.id, qa: pr.menko.quote_part_amenageur_pct, urb: pr.menko.urbaniste },
        parc: { regime: pa.regime, sup: pa.superficie, statut: pa.statut, titre: pa.num_titre, prog: pa.programme_id === pr.id, statut2: pa2.statut, titre2: pa2.num_titre || '' }, titres: DATA.titres_fonciers.map(function (t) { return t.type + ':' + t.numero + ':' + t.regime; }),
        l12: { statut: l12.statut, prix: l12.prix, hv: l12.hors_vente, iv: l12.import_vente, tf: l12.num_tf_parcellaire, x: l12.coord_utm_x, prog: l12.programme_id === pr.id, parc: l12.parcelle_id === pa.id, nature: l12.nature, num: l12.numero, ilot: l12.ilot, sup: l12.surface, suivi: l12.suivi_titre.statut_instruction_mclu, final: l12.suivi_titre.num_titre_final, remise: l12.suivi_titre.date_remise_client },
        l13: { statut: l13.statut, hv: l13.hors_vente, iv: l13.import_vente || null, prix: l13.prix || 0, suivi: l13.suivi_titre.statut_instruction_mclu }, l1: { statut: l1.statut, hv: l1.hors_vente, jur: l1.statut_juridique }, n: { prog: DATA.programmes.length, parc: DATA.parcelles.length, lots: DATA.lots.length } };
    }, MODELE);
    assert.deepEqual(r.res.p, { crees: 2, maj: 0 }); assert.deepEqual(r.res.pa, { crees: 2, maj: 0 }); assert.equal(r.res.t, 1); assert.deepEqual(r.res.l, { crees: 3, maj: 0, statut_conserve: 0 }); assert.equal(r.res.s, 2); assert.equal(r.res.i, 0);
    assert.deepEqual(r.res.v.map((v) => [v.lot, v.acquereur, v.prix, v.taux]), [['Îlot 04 · lot 12', 'M. TRAORÉ Mamadou', 18500000, 65]]);
    assert.deepEqual(r.prog, { nom: 'Résidence Les Palmiers - Akandjé', loc: 'Bingerville — Akandjé', nature: 'lotissement', nb: 3, par: true, qa: 65, urb: 'Cabinet URBA-CI (M. Kouassi)' });
    assert.deepEqual(r.parc, { regime: 'urbain', sup: 125000, statut: 'tf_definitif', titre: 'TF-214580', prog: true, statut2: 'negociation', titre2: '' }); assert.deepEqual(r.titres, ['tf_definitif:TF-214580:urbain']);
    assert.equal(r.l12.statut, 'reserve'); assert.equal(r.l12.prix, 18500000); assert.equal(r.l12.hv, false); assert.equal(r.l12.iv.statut_commercial, 'Vendu'); assert.equal(r.l12.tf, 'TF-218904'); assert.equal(r.l12.x, 398452.12); assert.equal(r.l12.prog && r.l12.parc, true);
    assert.deepEqual([r.l12.nature, r.l12.num, r.l12.ilot, r.l12.sup, r.l12.suivi, r.l12.final, r.l12.remise], ['terrain', '12', '04', 500, 'Validé / Transmis Conservation', 'TF-218904', '2026-04-28']);
    assert.deepEqual(r.l13, { statut: 'reserve', hv: true, iv: null, prix: 0, suivi: "En cours d'instruction" }); assert.deepEqual(r.l1, { statut: 'reserve', hv: true, jur: 'Réserve Domaniale' }); assert.deepEqual(r.n, { prog: 2, parc: 2, lots: 3 });
  } finally { await app.fermer(); }
});

test('ré-import : idempotent (aucun doublon) ; un lot déjà rattaché à un souscripteur garde statut et prix', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) {
      await fonImportAppliquer(fonImportAnalyser(await __lire(b)), {});
      const l12 = DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL04-LT12'; }); l12.statut = 'vendu'; l12.prix = 17000000; DATA.clients = [{ id: 'c1', nom: 'TRAORÉ', lot_id: l12.id }];
      DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL01-LT01'; }).observations_terrain = 'modifié à la main';
      const R2 = fonImportAnalyser(await __lire(b)), res2 = await fonImportAppliquer(R2, {});
      const nb = { prog: DATA.programmes.length, parc: DATA.parcelles.length, lots: DATA.lots.length, titres: DATA.titres_fonciers.length };
      return { stats: { o: R2.stats.operations, l: R2.stats.lots }, res: { p: res2.programmes, pa: res2.parcelles, t: res2.titres, l: res2.lots, v: res2.ventes.length }, nb: nb, l12: { statut: l12.statut, prix: l12.prix }, obs: DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL01-LT01'; }).observations_terrain };
    }, MODELE);
    assert.deepEqual(r.stats.o, { total: 2, erreurs: 0, valides: 2, creations: 0, maj: 2 }); assert.deepEqual(r.stats.l, { total: 3, erreurs: 0, valides: 3, creations: 0, maj: 3 });
    assert.deepEqual(r.res, { p: { crees: 0, maj: 2 }, pa: { crees: 0, maj: 2 }, t: 0, l: { crees: 0, maj: 3, statut_conserve: 1 }, v: 0 }); assert.deepEqual(r.nb, { prog: 2, parc: 2, lots: 3, titres: 1 });
    assert.deepEqual(r.l12, { statut: 'vendu', prix: 17000000 }); assert.equal(r.obs, 'Conforme plan urbanisme approuvé');
  } finally { await app.fermer(); }
});

test('erreurs : l\'import est refusé tel quel ; « importer les lignes valides » ignore les lignes en erreur et leurs dépendances', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function () {
      const R = fonImportAnalyser(__fab({ ops: [__op(), __op({ id_operation: 'OP-2', quote_part_village_pct: 5 })], lots: [__lot(), __lot({ id_lot_menko: 'L2', id_operation: 'OP-2' }), __lot({ id_lot_menko: 'L3', num_lot: '03', superficie_m2: 'abc' })],
        wf: [{ id_dossier_menko: 'D1', id_lot_menko: 'L1', type_procedure: 'X' }, { id_dossier_menko: 'D2', id_lot_menko: 'L2', type_procedure: 'X' }] }));
      const refus = await fonImportAppliquer(R, {}), n0 = DATA.lots.length;
      const ok = await fonImportAppliquer(R, { ignorerErreurs: true });
      return { stats: R.stats.erreurs, refus: refus.ok, msg: refus.erreur, n0: n0, ok: ok.ok, ign: ok.ignorees, lots: DATA.lots.map(function (l) { return l.ref_import; }), progs: DATA.programmes.map(function (p) { return p.ref_import; }), suivis: ok.suivis };
    });
    assert.equal(r.refus, false); assert.match(r.msg, /erreur\(s\)/); assert.equal(r.n0, 0); assert.equal(r.ok, true); assert.deepEqual(r.lots, ['L1']); assert.deepEqual(r.progs, ['OP-1']); assert.equal(r.suivis, 1); assert.equal(r.ign, 4);
  } finally { await app.fermer(); }
});

test('profil sans droit foncier : import refusé ; fichier non .xlsx refusé ; écran : analyse puis résultat et ventes à rattacher, alertes, aucune erreur de page', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await T(app.page, async function (b) {
      const R = fonImportAnalyser(await __lire(b)), vrai = fcDroitEcriture; fcDroitEcriture = function () { return false; }; const refus = await fonImportAppliquer(R, {}); fcDroitEcriture = vrai;
      window.__toasts.length = 0; await fonImportFichier({ files: [new File(['x'], 'modele.csv')], value: '' }); const msgCsv = window.__toasts.join('|');
      await fonImportFichier({ files: [new File([__buf(b)], 'Modele.xlsx')], value: '' });
      fonRuralVue('import'); const h1 = document.getElementById('fon-rural-liste').innerHTML;
      window.confirm = function () { return true; }; await fonImportLancer(); const h2 = document.getElementById('fon-rural-liste').innerHTML;
      DATA.lots.find(function (l) { return l.ref_import === 'BING01-IL04-LT13'; }).suivi_titre.motif_blocage = 'Opposition villageoise';
      const al = fonAlertes().filter(function (a) { return a.vue === 'import'; }).map(function (a) { return a.niveau + '|' + a.texte; });
      let csv = ''; const A = URL.createObjectURL; URL.createObjectURL = function (bl) { csv = bl; return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () {}; fonImportVentesCsv(); fonImportRapportCsv(); URL.createObjectURL = A;
      return { refus: refus.ok === false && /profil/.test(refus.erreur), msgCsv: msgCsv, cartes: /2 \/ 2/.test(h1) && /3 \/ 3/.test(h1), vente: /1 lot\(s\) vendu\(s\)/.test(h1), aucun: /Aucun problème détecté/.test(h1), res: /Résultat de l'import/.test(h2) && /M\. TRAORÉ Mamadou/.test(h2), al: al, csv: csv instanceof Blob };
    }, MODELE);
    assert.equal(r.refus, true); assert.match(r.msgCsv, /\.xlsx attendu/); assert.equal(r.cartes, true); assert.equal(r.vente, true); assert.equal(r.aucun, true); assert.equal(r.res, true); assert.equal(r.csv, true);
    assert.deepEqual(r.al.sort(), ["info|1 lot(s) vendu(s) importé(s) à rattacher à leur souscripteur (Clients).", "orange|Lot BING01-IL04-LT13 : dossier de titre bloqué — Opposition villageoise."].sort());
    assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});
