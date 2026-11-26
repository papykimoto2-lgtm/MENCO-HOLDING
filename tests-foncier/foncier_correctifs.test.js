/* Foncier L15 — correctifs de la revue générale : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function base(page) {
  await page.evaluate(function () {
    DATA.parcelles = [{ id: 'p1', ref: 'TERRE-1', regime: 'rural', superficie: 20000, statut: 'prospection', historique: [] }, { id: 'u1', ref: 'URB-1', regime: 'urbain', superficie: 5000, statut: 'prospection' }];
    ['enquetes_fonciers', 'oppositions_fonciers', 'bornages_fonciers', 'villages_fonciers', 'ayants_droit_fonciers', 'titres_fonciers', 'proprietaires_fonciers', 'charges_fonciers', 'exploitations_fonciers', 'contrats_fonciers', 'audits_fonciers', 'protocoles_purge_fonciers', 'cessions_foncieres', 'pv_remises_fonciers', 'dossiers_fonciers', 'programmes', 'lots', 'clients', 'versements', 'constats_coherence_fonciers', 'ecritures'].forEach(function (k) { DATA[k] = []; });
    window.prompt = function () { return 'Motif de test suffisamment long'; };
  });
}

test('bornage : modifier la fiche conserve les signatures ; retirer un signataire est refusé', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    await app.page.evaluate(() => { DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-1', parcelle_id: 'p1', statut: 'convoque', date: '2026-07-01', convocations: [{ nom: 'Koffi', qualite: 'riverain', present: true, signe: true, signature: 'data:image/png;base64,AAA', signe_le: '2026-07-01', signe_par_appareil: 'tel1' }, { nom: 'Yao', qualite: 'riverain', present: false, signe: false }] }]; });
    await app.page.evaluate(async () => { fonRuralOuvrir('bornages', 'b1'); document.getElementById('fonr-date').value = '2026-07-15'; await fonRuralEnregistrer(); });
    let c = await app.page.evaluate(() => DATA.bornages_fonciers[0]);
    assert.equal(c.date, '2026-07-15'); assert.equal(c.convocations[0].signature, 'data:image/png;base64,AAA'); assert.equal(c.convocations[0].signe_par_appareil, 'tel1'); assert.equal(c.convocations.length, 2);
    // on retire Koffi (signé) → refus
    await app.page.evaluate(async () => { fonRuralOuvrir('bornages', 'b1'); const t = document.getElementById('fonr-convocations'); t.value = 'Yao ; riverain ; non ; non'; await fonRuralEnregistrer(); });
    c = await app.page.evaluate(() => DATA.bornages_fonciers[0]); assert.equal(c.convocations.length, 2); assert.equal(c.convocations[0].nom, 'Koffi');
  } finally { await app.fermer(); }
});

test('import : un statut de parcelle avancé n\'est jamais rétrogradé ; écriture refusée signalée', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      DATA.parcelles = [{ id: 'pa', ref: 'OP-1', regime: 'urbain', commune: 'Bingerville', localisation: 'A', superficie: 10000, statut: 'acquis' }, { id: 'pb', ref: 'OP-2', regime: 'urbain', commune: 'Songon', localisation: 'B', superficie: 8000, statut: 'prospection' }];
      DATA.programmes = [{ id: 'g1', nom: 'P1', parcelle_id: 'pa', ref_import: 'OP-1' }, { id: 'g2', nom: 'P2', parcelle_id: 'pb', ref_import: 'OP-2', menko: { statut_purge: 'Finalisée', tf_mere: 'TF-1234' } }];
      const u8 = fonClasseurEtat(), c = await fonXlsxLire(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), R = fonImportAnalyser(c);
      const res = await fonImportAppliquer(R, {});
      const apres = DATA.parcelles.map(p => p.id + ':' + p.statut);
      // écriture refusée par la base locale
      const vrai = window.dbPut; window.dbPut = async function () { return false; };
      const R2 = fonImportAnalyser(c), res2 = await fonImportAppliquer(R2, {}); window.dbPut = vrai;
      return { ok: res.ok, apres, ko: { ok: res2.ok, erreur: res2.erreur } };
    });
    assert.equal(r.ok, true); assert.equal(r.apres[0], 'pa:acquis'); assert.equal(r.apres[1], 'pb:tf_definitif', 'jamais de régression ; une parcelle encore en prospection peut avancer (TF mère connu)');
    assert.equal(r.ko.ok, false); assert.match(r.ko.erreur, /écriture\(s\) refusée\(s\)/);
  } finally { await app.fermer(); }
});

test('export : programmes et lots sans clé reçoivent une clé d\'import → ré-import sans doublon (même sans parcelle liée)', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      DATA.programmes = [{ id: 'g9', nom: 'Sans parcelle', localisation: 'Dabou' }];
      DATA.lots = [{ id: 'lotx1', programme_id: 'g9', numero: '', ilot: '01', surface: 400, statut: 'disponible', prix: 1000000 }, { id: 'lotx2', programme_id: 'g9', numero: '7', ilot: '01', surface: 400, statut: 'disponible' }];
      const n = await fonEtatPersisterCles(), avant = { p: DATA.programmes.length, l: DATA.lots.length };
      const u8 = fonClasseurEtat(), c = await fonXlsxLire(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), R = fonImportAnalyser(c);
      const etat = { ops: R.operations.map(o => o._existe), lots: R.lots.map(l => l._existe), err: R.stats.erreurs, codeLot: c.feuilles.MENKO_LOTS[2][0], numLot: c.feuilles.MENKO_LOTS[2][3] };
      const res = await fonImportAppliquer(R, {});
      const u2 = fonClasseurEtat(), c2 = await fonXlsxLire(u2.buffer.slice(u2.byteOffset, u2.byteOffset + u2.byteLength)), res2 = await fonImportAppliquer(fonImportAnalyser(c2), {});   /* 2e ré-import : plus rien à créer */
      return { n, avant, apres: { p: DATA.programmes.length, a: DATA.parcelles.length, l: DATA.lots.length }, etat, crees: res.ok ? [res.programmes.crees, res.lots.crees] : res, parcMere: res.parcelles.crees, crees2: [res2.programmes.crees, res2.parcelles.crees, res2.lots.crees], cle: DATA.programmes[0].ref_import };
    });
    assert.equal(r.n, 3); assert.deepEqual(r.etat.ops, ['maj']); assert.deepEqual(r.etat.lots, ['maj', 'maj']); assert.equal(r.etat.err, 0);
    assert.doesNotMatch(r.etat.codeLot, /undefined|null/); assert.match(r.etat.numLot, /^X/);
    assert.deepEqual(r.crees, [0, 0]); assert.ok(r.parcMere <= 1, 'la parcelle mère manquante est créée une seule fois'); assert.deepEqual(r.crees2, [0, 0, 0]); assert.equal(r.apres.p, 1); assert.equal(r.apres.l, 2); assert.equal(r.cle, 'PRG-g9');
  } finally { await app.fermer(); }
});

test('cohérence : 400 contours en moins de 3 s, sans faux recouvrement ; réouverture si la gravité augmente ; synchronisations en série', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      const carre = (x, y, c) => [{ x, y }, { x: x + c, y }, { x: x + c, y: y + c }, { x, y: y + c }];
      DATA.parcelles = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) DATA.parcelles.push({ id: 'g' + i + '_' + j, ref: 'G' + i + '-' + j, regime: 'urbain', superficie: 8100, bornes: carre(500000 + i * 100, 700000 + j * 100, 90), utm_zone: 30, statut: 'prospection' });
      const t0 = performance.now(), l = fonCoherenceAnalyser(), ms = performance.now() - t0;
      const chev = l.filter(x => x.code === 'doublon' || x.code === 'incluse' || x.code === 'chevauchement').length;
      // réouverture
      DATA.parcelles = [DATA.parcelles[0]]; DATA.parcelles[0].superficie = 8700; DATA.constats_coherence_fonciers = [];
      await fonCoherenceSynchroniser(); const c0 = DATA.constats_coherence_fonciers[0];
      c0.statut = 'maintenu'; c0.decision = { type: 'maintenu', texte: 'Écart accepté par la direction', par: 'K', le: today() }; const niveauAvant = c0.niveau;
      DATA.parcelles[0].superficie = 4000; await fonCoherenceSynchroniser();
      const apres = { statut: DATA.constats_coherence_fonciers[0].statut, niveau: DATA.constats_coherence_fonciers[0].niveau, niveauAvant };
      // synchronisations simultanées : un seul constat
      await Promise.all([fonCoherenceSynchroniser(), fonCoherenceSynchroniser(), fonCoherenceSynchroniser()]);
      return { ms, n: l.length, chev, apres, nb: DATA.constats_coherence_fonciers.length };
    });
    assert.ok(r.ms < 3000, 'analyse : ' + Math.round(r.ms) + ' ms'); assert.equal(r.chev, 0);
    assert.equal(r.apres.niveauAvant, 'majeur'); assert.equal(r.apres.niveau, 'critique'); assert.equal(r.apres.statut, 'ouvert'); assert.equal(r.nb, 1);
  } finally { await app.fermer(); }
});

test('contrat actif : échéancier recalculé tant que rien n\'est encaissé ; verrouillé ensuite ; escHtml(0) ; CSV sans formule', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      DATA.contrats_fonciers = [{ id: 'k1', reference: 'CTR-1', parcelle_id: 'p1', type: 'bail', partie: 'M. P', statut: 'actif', periodicite: 'annuelle', redevance: 100000, date_debut: '2026-01-01', date_fin: '2028-01-01', echeances: [] }];
      DATA.contrats_fonciers[0].echeances = _fonEcheancesContrat(DATA.contrats_fonciers[0]);
      const ex = DATA.contrats_fonciers[0], neuf = Object.assign({}, ex, { redevance: 120000 }), erreur = fonDroitsPreparer('contrats', neuf, ex);
      const apres = neuf.echeances.map(e => e.montant);
      ex.echeances[0].statut = 'paye'; const neuf2 = Object.assign({}, ex, { redevance: 150000 }), erreur2 = fonDroitsPreparer('contrats', neuf2, ex);
      DATA.enquetes_fonciers = [{ id: 'e1', reference: '=HYPERLINK("x")', parcelle_id: 'p1', commissaire: '+cmd', statut: 'planifiee' }];
      return { erreur, apres, erreur2, zero: escHtml(0), vide: escHtml(null), csv: fonRuralCsv('enquetes') };
    });
    assert.equal(r.erreur, ''); assert.ok(r.apres.length >= 2 && r.apres.every(m => m === 120000)); assert.match(r.erreur2, /déjà encaissées/);
    assert.equal(r.zero, '0'); assert.equal(r.vide, ''); assert.match(r.csv, /"'=HYPERLINK/); assert.match(r.csv, /"'\+cmd"/);
  } finally { await app.fermer(); }
});

test('sauvegarde : l\'écriture réussit avant la mémoire ; profil sans droit : aucune modification en mémoire', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      DATA.oppositions_fonciers = [{ id: 'o1', reference: 'OPP-1', parcelle_id: 'p1', opposant: 'A', motif: 'm', statut: 'ouverte' }];
      const vrai = window.fcDb; window.fcDb = async function () { throw new Error('refusé'); };
      const ok = await fonRuralSauver('oppositions', { id: 'neuf', reference: 'OPP-9', parcelle_id: 'p1', opposant: 'B', motif: 'x', statut: 'ouverte' }); window.fcDb = vrai;
      const n1 = DATA.oppositions_fonciers.length;
      const droit = window.fcDroitEcriture; window.fcDroitEcriture = () => false; await fonRuralAction('oppositions', 'o1', 'levee'); window.fcDroitEcriture = droit;
      return { ok, n1, statut: DATA.oppositions_fonciers[0].statut };
    });
    assert.equal(r.ok, false); assert.equal(r.n1, 1); assert.equal(r.statut, 'ouverte');
  } finally { await app.fermer(); }
});

test('parcours : terre urbaine sans audit = purge sans objet ; pastilles numérotées avec libellé accessible', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(() => {
      const u = fonParcoursParcelle(DATA.parcelles[1]).filter(e => e.id === 'purger')[0], ru = fonParcoursParcelle(DATA.parcelles[0]).filter(e => e.id === 'purger')[0];
      goTo('foncier'); switchTab('foncier', 'parcours'); const h = document.getElementById('fon-parcours-root').innerHTML;
      return { urbain: u.etat, rural: ru.etat, h, entetes: (h.match(/<thead>/g) || []).length, wrap: (h.match(/table-wrap/g) || []).length };
    });
    assert.equal(r.urbain, 'na'); assert.equal(r.rural, 'bloque'); assert.match(r.h, /role="img"/); assert.match(r.h, /aria-label="Étape \d/); assert.match(r.h, /Touchez ou survolez/); assert.ok(r.entetes >= 1); assert.ok(r.wrap >= 2);
  } finally { await app.fermer(); }
});

test('écrans : Tableau de bord supprimé, « Commencer ici », 2.5 avant 2.6, statuts accentués, état vide guidant, corbeille réservée à l\'administrateur', async () => {
  const app = await ouvrirApp();
  try {
    await base(app.page);
    const r = await app.page.evaluate(async () => {
      const nav = document.querySelector('#page-foncier .steps-nav').innerHTML;
      goTo('foncier'); switchTab('foncier', 'rural'); fonRuralVue('oppositions'); const vide = document.getElementById('fon-rural-liste').innerHTML;
      DATA.oppositions_fonciers = [{ id: 'o1', reference: 'OPP-1', parcelle_id: 'p1', opposant: 'A', motif: 'm', statut: 'en_mediation' }]; DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-1', parcelle_id: 'p1', statut: 'convoque', convocations: [] }];
      fonRuralVue('oppositions'); const liste = document.getElementById('fon-rural-liste').innerHTML; fonRuralVue('bornages'); const born = document.getElementById('fon-rural-liste').innerHTML;
      const hr = window.hasRole; window.hasRole = () => false; fonRuralVue('oppositions'); const nonAdmin = document.getElementById('fon-rural-liste').innerHTML; window.hasRole = hr;
      fonAller('page:lots'); const retour = !!document.getElementById('fon-retour'); fonAller('tab:parcours'); const retour2 = !!document.getElementById('fon-retour');
      return { nav, vide, liste, born, nonAdmin, retour, retour2, i25: nav.indexOf('2.5 Information'), i26: nav.indexOf('2.6 Droits') };
    });
    assert.doesNotMatch(r.nav, /renderFoncierDashboard/); assert.match(r.nav, /Commencer ici/); assert.ok(r.i25 > -1 && r.i26 > r.i25, '2.5 doit précéder 2.6');
    assert.match(r.vide, /Rien d'enregistré pour l'instant/); assert.match(r.vide, /fonRuralOuvrir\('oppositions'\)/);
    assert.match(r.liste, /En médiation/); assert.match(r.liste, /aria-label="Modifier"/); assert.match(r.liste, /aria-label="Supprimer"/); assert.doesNotMatch(r.liste, /en_mediation|en mediation/);
    assert.match(r.born, /Convoqué/); assert.match(r.born, /Annuler le bornage/);
    assert.doesNotMatch(r.nonAdmin, /aria-label="Supprimer"/); assert.match(r.nonAdmin, /aria-label="Imprimer la fiche"/);
    assert.equal(r.retour, true); assert.equal(r.retour2, false);
  } finally { await app.fermer(); }
});
