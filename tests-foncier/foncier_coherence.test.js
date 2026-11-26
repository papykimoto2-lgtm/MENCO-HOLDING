/* Foncier L12 — état des incohérences, corrections guidées : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    var carre = function (x, y, c) { return [{ x: x, y: y }, { x: x + c, y: y }, { x: x + c, y: y + c }, { x: x, y: y + c }]; };
    DATA.parcelles = [
      { id: 'a', ref: 'A', regime: 'urbain', superficie: 1000, bornes: carre(500000, 700000, 100), utm_zone: 30, statut: 'prospection', created_at: '2026-01-01' },
      { id: 'd1', ref: 'D1', regime: 'urbain', superficie: 10000, bornes: carre(500500, 700000, 100), utm_zone: 30, statut: 'prospection', created_at: '2026-01-01' },
      { id: 'd2', ref: 'D2', regime: 'urbain', superficie: 10000, bornes: carre(500500, 700000, 100), utm_zone: 30, statut: 'prospection', created_at: '2026-02-01' },
      { id: 'big', ref: 'BIG', regime: 'urbain', superficie: 90000, bornes: carre(501000, 700000, 300), utm_zone: 30, statut: 'lotissement', created_at: '2026-01-01' },
      { id: 'in', ref: 'IN', regime: 'urbain', superficie: 2500, bornes: carre(501100, 700100, 50), utm_zone: 30, statut: 'prospection', created_at: '2026-01-01' },
      { id: 'p1', ref: 'P1', regime: 'urbain', superficie: 10000, bornes: carre(502000, 700000, 100), utm_zone: 30, statut: 'tf_definitif', created_at: '2026-01-01' },
      { id: 'p2', ref: 'P2', regime: 'urbain', superficie: 10000, bornes: carre(502050, 700000, 100), utm_zone: 30, statut: 'prospection', created_at: '2026-01-01' },
      { id: 'r', ref: 'R', regime: 'rural', superficie: 5000, bornes: [], statut: 'prospection', created_at: '2026-01-01' }];
    DATA.lots = [{ id: 'l1', parcelle_id: 'big', statut: 'vendu', surface: 100, numero: '1' }, { id: 'l2', parcelle_id: 'r', statut: 'disponible', surface: 100, numero: '2' }];
    ['programmes', 'titres_fonciers', 'dossiers_fonciers', 'protocoles_purge_fonciers', 'audits_fonciers', 'enquetes_fonciers', 'bornages_fonciers', 'oppositions_fonciers', 'cessions_foncieres', 'proprietaires_fonciers', 'ayants_droit_fonciers', 'pv_remises_fonciers', 'ecritures'].forEach(function (k) { DATA[k] = []; });
    window.prompt = function () { return 'motif de test'; };
  });
}
const codes = (page, id) => page.evaluate(function (i) { return fonCoherenceAnalyser().filter(function (x) { return !i || x.parcelle_id === i; }).map(function (x) { return x.code; }).sort(); }, id);

test('détection : surface, doublon, incluse, chevauchement, titre, souscripteur, purge', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const all = await app.page.evaluate(() => fonCoherenceAnalyser().map(x => x.code + ':' + x.parcelle_id + ':' + x.niveau));
    const a = (c, id) => all.filter(x => x.indexOf(c + ':' + (id || '')) === 0);
    assert.equal(a('superficie_contour', 'a').length, 1); assert.match(a('superficie_contour', 'a')[0], /critique$/);
    assert.equal(all.filter(x => x.startsWith('doublon')).length, 1);
    assert.equal(all.filter(x => x.startsWith('incluse')).length, 1); assert.ok(all.some(x => x.startsWith('incluse:in')));
    assert.equal(all.filter(x => x.startsWith('chevauchement')).length, 1);
    assert.equal(a('vendu_sans_souscripteur', 'big').length, 1);
    assert.equal(a('sans_contour', 'r').length, 1); assert.equal(a('rural_sans_ayant_droit', 'r').length, 1); assert.equal(a('rural_loti_sans_purge', 'r').length, 1);
    assert.equal(a('titre_manquant', 'p1').length, 1);
    assert.equal(a('superficie_contour', 'd1').length, 0);
    const r = await app.page.evaluate(() => fonCoherenceResume());
    assert.ok(r.critique >= 4 && r.total === r.critique + r.majeur + r.info);
  } finally { await app.fermer(); }
});

test('corrections : aligner la surface, fusionner un doublon (réversible), déroger', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    await app.page.evaluate(() => fonCohAlignerSurface('a'));
    const sup = await app.page.evaluate(() => DATA.parcelles[0].superficie);
    assert.ok(Math.abs(sup - 10000) < 200, 'superficie alignée : ' + sup);
    assert.equal((await codes(app.page, 'a')).indexOf('superficie_contour'), -1);
    assert.match(await app.page.evaluate(() => JSON.stringify(DATA.parcelles[0].historique)), /Superficie alignée/);
    // doublon : D2 (plus récent, sans lien) archivé dans D1
    await app.page.evaluate(() => fonCohFusionner('d2', 'd1'));
    const d2 = await app.page.evaluate(() => DATA.parcelles.filter(x => x.id === 'd2')[0]);
    assert.equal(d2.fusionnee_dans, 'd1'); assert.equal(d2.archive_coherence.motif, 'motif de test');
    assert.equal((await app.page.evaluate(() => fonCoherenceAnalyser().filter(x => x.code === 'doublon').length)), 0);
    await app.page.evaluate(() => fonCohRetablir('d2'));
    assert.equal((await app.page.evaluate(() => fonCoherenceAnalyser().filter(x => x.code === 'doublon').length)), 1);
    // incluse : IN archivée dans BIG ; une fiche avec liens n'est pas archivable
    await app.page.evaluate(() => { DATA.titres_fonciers = [{ id: 't', parcelle_id: 'in', type: 'tf_definitif' }]; });
    await app.page.evaluate(() => fonCohFusionner('in', 'big'));
    assert.equal(await app.page.evaluate(() => DATA.parcelles.filter(x => x.id === 'in')[0].fusionnee_dans), undefined);
    // dérogation sur le chevauchement partiel
    await app.page.evaluate(() => fonCohDeroger('p1', 'p2'));
    assert.equal((await app.page.evaluate(() => fonCoherenceAnalyser().filter(x => x.code === 'chevauchement').length)), 0);
    assert.match(await app.page.evaluate(() => JSON.stringify(DATA.parcelles.filter(x => x.id === 'p1')[0].derogation_chevauchement)), /motif de test/);
  } finally { await app.fermer(); }
});

test('écran : rendu, filtre, impression, badge', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    await app.page.evaluate(async () => { goTo('foncier'); await fonCoherenceRender(); });
    const h = await app.page.evaluate(() => document.getElementById('fon-coherence-root').innerHTML);
    assert.match(h, /Cohérence des données foncières/); assert.match(h, /Aligner la superficie sur le contour/); assert.match(h, /Fusionner : archiver/); assert.match(h, /Note de calcul et mode d'emploi — Cohérence/);
    await app.page.evaluate(async () => { fonCohFiltrer('critique'); await new Promise(r => setTimeout(r, 400)); });
    assert.doesNotMatch(await app.page.evaluate(() => document.getElementById('fon-coherence-root').innerHTML), /Doublon probable/);
    assert.match(await app.page.evaluate(() => document.getElementById('fon-coherence-root').innerHTML), /Proposition du logiciel/);
    assert.ok(Number(await app.page.evaluate(() => document.getElementById('fon-coh-badge').textContent)) > 0);
  } finally { await app.fermer(); }
});

test('registre : détection, proposition objective, observation, décision, correction attribuée, disparition, réapparition', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    await app.page.evaluate(() => { DATA.parcelles[0].contenance = '10 000'; DATA.constats_coherence_fonciers = []; });
    await app.page.evaluate(() => fonCoherenceSynchroniser());
    const reg = () => app.page.evaluate(() => DATA.constats_coherence_fonciers.map(c => ({ cle: c.cle, statut: c.statut, ref: c.reference, prop: c.proposition, obs: c.observations.length, dec: c.decision && c.decision.type, id: c.id })));
    let r = await reg();
    assert.ok(r.length >= 8); assert.ok(r.every(c => c.statut === 'ouvert' && /^COH-\d{4}-\d{3}$/.test(c.ref) && c.prop));
    assert.match(r.filter(c => c.cle === 'superficie_contour|a')[0].prop, /contenance du titre.*confirme le contour/);
    const n = r.length;
    await app.page.evaluate(() => fonCoherenceSynchroniser());
    assert.equal((await reg()).length, n, 'pas de doublon de constat');
    // observation (n'ferme pas)
    await app.page.evaluate(() => { window.prompt = () => 'Le géomètre revient la semaine prochaine'; });
    const idDoublon = r.filter(c => c.cle.startsWith('doublon'))[0].id;
    await app.page.evaluate(id => fonCohObserver(id), idDoublon);
    let d = (await reg()).filter(c => c.id === idDoublon)[0]; assert.equal(d.obs, 1); assert.equal(d.statut, 'ouvert');
    // maintenir : motif trop court refusé, puis accepté
    await app.page.evaluate(() => { window.prompt = () => 'court'; });
    await app.page.evaluate(id => fonCohMaintenir(id), idDoublon);
    assert.equal((await reg()).filter(c => c.id === idDoublon)[0].statut, 'ouvert');
    await app.page.evaluate(() => { window.prompt = () => 'Deux phases distinctes du même site, contour identique voulu'; });
    await app.page.evaluate(id => fonCohMaintenir(id), idDoublon);
    d = (await reg()).filter(c => c.id === idDoublon)[0]; assert.equal(d.statut, 'maintenu'); assert.equal(d.dec, 'maintenu');
    await app.page.evaluate(() => fonCoherenceSynchroniser());
    assert.equal((await reg()).filter(c => c.id === idDoublon)[0].statut, 'maintenu', 'décision respectée au contrôle suivant');
    // correction depuis l'écran : attribuée au constat
    await app.page.evaluate(() => { window.prompt = () => 'Aligné sur la contenance du titre'; });
    await app.page.evaluate(() => fonCohAlignerSurface('a'));
    let s = (await reg()).filter(c => c.cle === 'superficie_contour|a')[0]; assert.equal(s.statut, 'corrige'); assert.equal(s.dec, 'correction');
    // correction hors écran : disparaît au contrôle
    await app.page.evaluate(() => { DATA.parcelles.filter(x => x.id === 'p1')[0].statut = 'prospection'; });
    await app.page.evaluate(() => fonCoherenceSynchroniser());
    assert.equal((await reg()).filter(c => c.cle === 'titre_manquant|p1')[0].statut, 'resolu_auto');
    // réapparition → rouvert
    await app.page.evaluate(() => { DATA.parcelles.filter(x => x.id === 'p1')[0].statut = 'tf_definitif'; });
    await app.page.evaluate(() => fonCoherenceSynchroniser());
    assert.equal((await reg()).filter(c => c.cle === 'titre_manquant|p1')[0].statut, 'ouvert');
    // persistance locale + état imprimable
    assert.ok(await app.page.evaluate(async () => (await dbGetAll('constats_coherence_fonciers')).length > 0));
  } finally { await app.fermer(); }
});
