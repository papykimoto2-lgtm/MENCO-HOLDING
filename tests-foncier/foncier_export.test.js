/* Foncier L14 — le classeur Excel MENKO vient du logiciel : modèle vierge, état rempli depuis la base, ré-import sans doublon. Le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);
const MODELE = fs.readFileSync(path.join(__dirname, 'fixtures', 'Modele_Import_MENKO_ERP_Foncier_V2.xlsx')).toString('base64');

async function amorcer(page) {
  await page.evaluate(function () {
    window.__buf = function (b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
    window.__b64 = function (u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
    DATA.parcelles = [{ id: 'pa', ref: 'PARC-A', regime: 'urbain', commune: 'Bingerville', localisation: 'Akandjé', superficie: 125000, statut: 'lotissement', num_titre: 'TF-214580', created_at: '2026-01-01' }];
    DATA.programmes = [{ id: 'g1', nom: 'Résidence Les Palmiers', localisation: 'Bingerville — Akandjé', parcelle_id: 'pa', menko: { statut_purge: 'Finalisée', ref_guide_villageois: 'GV-1', urbaniste: 'Cabinet URBA', quote_part_amenageur_pct: 65, quote_part_village_pct: 35, notaire: 'Étude Me Diallo', tf_mere: 'TF-214580', date_depot_plan: '2025-03-10' } }];
    DATA.lots = [
      { id: 'l1', programme_id: 'g1', parcelle_id: 'pa', numero: '12', ilot: '04', surface: 500, affectation: 'Habitation Individuelle', origine_propriete: 'Part Aménageur', statut: 'vendu', prix: 18500000, statut_juridique: 'TF Parcellaire Créé', num_tf_parcellaire: 'TF-218904', eligible_morcellement: true, coord_utm_x: 398452.12, coord_utm_y: 593210.45,
        suivi_titre: { id_dossier: 'DOS-1', type_procedure: 'Morcellement TF + Mutation', urbaniste_validation_plan: 'Validé et Signé (ONUCI)', date_visa_urbaniste: '2025-03-05', statut_instruction_mclu: 'Enquête Commodo', motif_blocage: 'Aucun blocage', commentaire_suivi: 'RAS' } },
      { id: 'l2', programme_id: 'g1', parcelle_id: 'pa', numero: '13', ilot: '04', surface: 500, origine_propriete: 'Part Villageoise', statut: 'reserve', hors_vente: true },
      { id: 'l3', programme_id: 'g1', parcelle_id: 'pa', numero: '14', ilot: '04', surface: 450, affectation: 'Habitation Individuelle', origine_propriete: 'Part Aménageur', statut: 'disponible', prix: 9000000 },
      { id: 'l4', programme_id: null, numero: '99', surface: 10, statut: 'disponible' }];
    DATA.clients = [{ id: 'c1', nom: 'TRAORÉ', prenoms: 'Mamadou', dossier: 'CLI-00412', lot_id: 'l1', montant_total: 18500000, statut: 'actif' }];
    DATA.versements = [{ id: 'v1', client_id: 'c1', montant: 12025000, type: 'versement', date: '2026-02-01' }];
    DATA.dossiers_fonciers = []; DATA.protocoles_purge_fonciers = []; DATA.titres_fonciers = []; DATA.constats_coherence_fonciers = [];
  });
}
const py = (fichier, code) => execFileSync('python3', ['-I', '-c', code, fichier], { encoding: 'utf8' });

test('modèle vierge : mêmes feuilles, mêmes en-têtes et libellés que le modèle fourni, listes déroulantes, volets figés ; lisible par Excel (openpyxl)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async (modele) => {
      const u8 = fonClasseurModeleVierge(), mine = await fonXlsxLire(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), ref = await fonXlsxLire(__buf(modele));
      const ent = (c, n) => c.feuilles[n].slice(0, 2).map(l => l.slice(0, 20).map(String));
      return { noms: Object.keys(mine.feuilles), egal: ['MENKO_OPERATIONS', 'MENKO_LOTS', 'MENKO_WORKFLOW_DOSSIERS'].map(n => JSON.stringify(ent(mine, n)) === JSON.stringify(ent(ref, n))), listes: JSON.stringify(mine.feuilles.REFERENTIEL_LISTES_MENKO.slice(1).map(l => l.slice(0, 9))) === JSON.stringify(mine.feuilles.REFERENTIEL_LISTES_MENKO.slice(1).map(l => l.slice(0, 9))), b64: __b64(u8) };
    }, MODELE);
    assert.deepEqual(r.noms, ['MENKO_OPERATIONS', 'MENKO_LOTS', 'MENKO_WORKFLOW_DOSSIERS', 'REFERENTIEL_LISTES_MENKO']); assert.deepEqual(r.egal, [true, true, true]);
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xl-')), 'modele.xlsx'); fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
    const o = py(f, "import sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1])\nfor ws in wb.worksheets: print(ws.title, ws.max_row, ws.max_column, ws.freeze_panes, len(ws.data_validations.dataValidation))\nws=wb['MENKO_LOTS']\nprint(ws['A1'].value, ws['H1'].value, ws['H2'].value)\nprint([ (str(d.sqref), d.formula1) for d in ws.data_validations.dataValidation][:4])");
    assert.match(o, /MENKO_OPERATIONS 2 19 A3 1/); assert.match(o, /MENKO_LOTS 2 18 A3 4/); assert.match(o, /MENKO_WORKFLOW_DOSSIERS 2 18 A3 4/); assert.match(o, /REFERENTIEL_LISTES_MENKO \d+ 9/);
    assert.match(o, /id_lot_menko statut_commercial Statut Commercial/); assert.match(o, /F3:F500.*REFERENTIEL_LISTES_MENKO!\$B\$2:\$B\$7/);
  } finally { await app.fermer(); }
});

test('état à jour : rempli depuis la base (programmes, lots, souscripteur, encaissement, suivi) + synthèse + parcelles ; lisible par Excel', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async () => { const u8 = fonClasseurEtat(), c = await fonXlsxLire(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); return { f: c.feuilles, b64: __b64(u8) }; });
    assert.deepEqual(Object.keys(r.f), ['MENKO_OPERATIONS', 'MENKO_LOTS', 'MENKO_WORKFLOW_DOSSIERS', 'REFERENTIEL_LISTES_MENKO', 'SYNTHESE_ETAT', 'PARCELLES_FONCIER']);
    const op = r.f.MENKO_OPERATIONS, lots = r.f.MENKO_LOTS, wf = r.f.MENKO_WORKFLOW_DOSSIERS;
    assert.equal(op.length, 3); assert.equal(op[2][0], 'PARC-A'); assert.equal(op[2][1], 'Résidence Les Palmiers'); assert.equal(op[2][2], 'Bingerville'); assert.equal(op[2][3], 'Akandjé'); assert.equal(op[2][4], 'Finalisée');
    assert.equal(op[2][14], 'TF-214580'); assert.equal(op[2][15], 125000); assert.equal(op[2][16], 65); assert.equal(op[2][17], 35); assert.equal(op[2][18], 'Étude Me Diallo');
    assert.equal(lots.length, 5, 'le lot sans programme n\'est pas exporté');
    const l1 = lots[2], l2 = lots[3], l3 = lots[4];
    assert.equal(l1[0], 'PARC-A-IL04-LT12'); assert.equal(l1[1], 'PARC-A'); assert.equal(l1[7], 'Vendu'); assert.equal(l1[10], 'CLI-00412'); assert.equal(l1[11], 'TRAORÉ Mamadou'); assert.equal(l1[12], 18500000); assert.equal(l1[13], 65); assert.equal(l1[14], 'Oui'); assert.equal(l1[15], 398452.12);
    assert.equal(l2[7], 'Non Commercialisable (Part Village)'); assert.equal(l3[7], 'Disponible'); assert.equal(l3[12], 9000000);
    assert.equal(wf.length, 3); assert.equal(wf[2][0], 'DOS-1'); assert.equal(wf[2][1], 'PARC-A-IL04-LT12'); assert.equal(wf[2][3], 'Validé et Signé (ONUCI)');
    const syn = r.f.SYNTHESE_ETAT.map(l => l.join('|')).join('\n'); assert.match(syn, /Lots vendus\|1/); assert.match(syn, /Lots non exportés \(aucun programme rattaché\)\|1/); assert.match(syn, /Chiffre d'affaires des lots vendus \(FCFA\)\|18500000/); assert.match(syn, /Encaissé sur prix \(FCFA\)\|12025000/);
    assert.equal(r.f.PARCELLES_FONCIER.length, 2); assert.equal(r.f.PARCELLES_FONCIER[1][0], 'PARC-A');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xl-')), 'etat.xlsx'); fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
    const o = py(f, "import sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1])\nprint([ws.title for ws in wb.worksheets])\nws=wb['MENKO_LOTS']\nprint(ws['A3'].value, ws['M3'].value, type(ws['M3'].value).__name__, ws.auto_filter.ref)");
    assert.match(o, /PARC-A-IL04-LT12 18500000 int/); assert.match(o, /A2:R5/);
  } finally { await app.fermer(); }
});

test('ré-import de l\'état : aucune erreur, tout est « mise à jour », aucun doublon (programme sans clé d\'import retrouvé par sa parcelle, lot par programme + îlot + numéro)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async () => {
      const avant = { p: DATA.programmes.length, a: DATA.parcelles.length, l: DATA.lots.length };
      const u8 = fonClasseurEtat(), c = await fonXlsxLire(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), R = fonImportAnalyser(c);
      const etat = { erreurs: R.stats.erreurs, ops: R.operations.map(o => o._existe), lots: R.lots.map(l => l._existe) };
      const res = await fonImportAppliquer(R, {});
      return { avant, apres: { p: DATA.programmes.length, a: DATA.parcelles.length, l: DATA.lots.length }, etat, res: res.ok ? { pc: res.programmes.crees, ac: res.parcelles.crees, lc: res.lots.crees, conserve: res.lots.statut_conserve } : res, cle: { prog: DATA.programmes[0].ref_import, lot: DATA.lots[0].ref_import } };
    });
    assert.equal(r.etat.erreurs, 0); assert.deepEqual(r.etat.ops, ['maj']); assert.deepEqual(r.etat.lots, ['maj', 'maj', 'maj']);
    assert.deepEqual(r.apres, r.avant); assert.equal(r.res.pc, 0); assert.equal(r.res.ac, 0); assert.equal(r.res.lc, 0); assert.equal(r.res.conserve, 1, 'le lot vendu garde son statut (versements du souscripteur)');
    assert.equal(r.cle.prog, 'PARC-A'); assert.equal(r.cle.lot, 'PARC-A-IL04-LT12');
  } finally { await app.fermer(); }
});

test('écran Import : boutons modèle vierge et état à jour', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const h = await app.page.evaluate(() => { goTo('foncier'); switchTab('foncier', 'rural'); fonRuralVue('import'); return document.getElementById('fon-rural-liste').innerHTML; });
    assert.match(h, /Le classeur vient du logiciel/); assert.match(h, /fonExporterModeleVierge/); assert.match(h, /fonExporterEtatExcel/);
  } finally { await app.fermer(); }
});
