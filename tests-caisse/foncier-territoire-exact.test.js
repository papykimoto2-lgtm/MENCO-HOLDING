/* Territoire — calcul exact côté serveur (PostGIS) : appel, comparaison, audit, carte, impression, SQL. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.dbPut = async function () { return true; }; window.fcDb = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {};
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); }; window.fonAuditOuvrir = function () { window.__OUV = (window.__OUV || 0) + 1; }; window.fonTerritoireCarteMaj = function () { window.__MAJ = (window.__MAJ || 0) + 1; };
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const CT = () => ({ le: '2026-11-28T10:00:00Z', par: 'Aud', ref: 'P-1', parcelle_id: 'p1', contour: true, aire_m2: 49100, couches: [], croisements: [
  { zone_id: 'z1', zone_nom: 'Réserve <b>A</b>', couche_id: 'c1', couche_nom: 'Forêts', version: '3', statut: 'officiel', categorie: 'interdit', pct: 98, m2: 48000, niveau: 'critique', point: 'AUD-JUR-03' },
  { zone_id: 'z2', zone_nom: 'ZAD B', couche_id: 'c2', couche_nom: 'ZAD', version: '1', statut: 'indicatif', categorie: 'sous_condition', pct: 10, m2: 4900, niveau: 'majeur', point: 'AUD-TECH-03' }] });
const EX = () => ({ aire_m2: 49028, zones_examinees: 3, calcule_par: 'PostGIS 3.3.7', croisements: [
  { zone_id: 'z1', zone_nom: 'Réserve <b>A</b>', couche_id: 'c1', couche_nom: 'Forêts', version: '3', categorie: 'interdit', m2: 49028, pct: 100, niveau: 'critique' },
  { zone_id: 'z3', zone_nom: 'Marais', couche_id: 'c3', couche_nom: 'Hydro', version: '2', categorie: 'alerte', m2: 800, pct: 1.6, niveau: 'info' }] });

test('comparaison : zones confirmées, nouvelles, non confirmées ; écarts ; niveaux ; texte échappé ; sans croisement exact', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ ct, ex }) => {
    var o = {}; var c = fonTerritoireExactComparer(ct, ex);
    o.l = c.lignes.map(function (l) { return [l.zone, l.pct_est, l.pct_exact, l.ecart].join('/'); }); o.niv = [c.niveau_est, c.niveau_exact]; o.aires = [c.aire_est, c.aire_exact];
    ex.le = '2026-11-28T11:00:00Z'; o.h = fonTerritoireExactHtml(ct, ex); o.vide = fonTerritoireExactHtml(Object.assign({}, ct, { croisements: [] }), { aire_m2: 49028, calcule_par: 'PostGIS', croisements: [], le: '2026-11-28T11:00:00Z' }); o.nonConfirme = fonTerritoireExactHtml(ct, { aire_m2: 49028, calcule_par: 'PostGIS', croisements: [], le: '2026-11-28T11:00:00Z' }); o.nul = [fonTerritoireExactHtml(null, ex), fonTerritoireExactHtml(ct, null)];
    var chg = fonTerritoireExactComparer({ croisements: [{ zone_id: 'a', couche_id: 'c', zone_nom: 'Z', pct: 3, niveau: 'critique' }] }, { croisements: [{ zone_id: 'a', couche_id: 'c', zone_nom: 'Z', pct: 0.4, niveau: 'majeur' }] }); o.chg = [chg.niveau_est, chg.niveau_exact]; return o;
  }, { ct: CT(), ex: EX() });
  assert.deepEqual(r.l, ['Réserve <b>A</b>/98/100/2', 'ZAD B/10//', 'Marais//1.6/']); assert.deepEqual(r.niv, ['critique', 'critique']); assert.deepEqual(r.aires, [49100, 49028]);
  assert.match(r.h, /PostGIS 3\.3\.7/); assert.match(r.h, /\+2 pt/); assert.match(r.h, /non confirmé/); assert.match(r.h, /nouveau/); assert.match(r.h, /Réserve &lt;b&gt;A&lt;\/b&gt;/); assert.doesNotMatch(r.h, /<b>A<\/b>/); assert.match(r.h, /géomètre fait foi/);
  assert.match(r.vide, /Aucun croisement confirmé[\s\S]*ne vaut pas conformité/); assert.match(r.nonConfirme, /non confirmé/); assert.match(r.nonConfirme, /le niveau change/); assert.deepEqual(r.nul, ['', '']); assert.deepEqual(r.chg, ['critique', 'majeur']);
});

test('appel serveur : URL, jeton, contour [lat, lng] ; absence de contour, 404, session, erreurs du serveur, hors ligne, réponse invalide', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ P }) => {
    new Function('(' + (function () { window.toast = function () {}; }).toString() + ')()')(); var o = {}, calls = [];
    window.SB = { url: 'https://exemple.supabase.co/', key: 'CLE-PUBLIQUE' }; window.sbAuth = function () { return 'JETON-PERSONNEL'; };
    var rep = function (statut, corps) { return async function (u, opt) { calls.push([String(u), opt]); return new Response(JSON.stringify(corps), { status: statut }); }; };
    var p = { id: 'p1', ref: 'P-1', geo_polygon: P }; window.fetch = rep(200, { aire_m2: 100, croisements: [], calcule_par: 'PostGIS' });
    var v = await fonTerritoireExactAppeler(p); o.url = calls[0][0]; o.h = [calls[0][1].headers.apikey, calls[0][1].headers.Authorization]; o.corps = JSON.parse(calls[0][1].body); o.ok = v.aire_m2;
    var err = async function (f, pp) { window.fetch = f; try { await fonTerritoireExactAppeler(pp || p); return 'accepté'; } catch (e) { return e.message; } };
    o.sans = await err(rep(200, {}), { id: 'x', geo_polygon: [[1, 2]] }); o.e404 = await err(rep(404, {})); o.e401 = await err(rep(401, {})); o.e500 = await err(rep(500, {}));
    o.acces = await err(rep(200, { erreur: 'acces_personnel_requis' })); o.contour = await err(rep(200, { erreur: 'contour_invalide' })); o.autre = await err(rep(200, { erreur: 'boum' })); o.invalide = await err(rep(200, { a: 1 }));
    o.horsligne = await err(async function () { throw new TypeError('Failed to fetch'); }); return o;
  }, { P: carre(5.349, -4.002, 5.351, -4.000) });
  assert.equal(r.url, 'https://exemple.supabase.co/rest/v1/rpc/fc_territoire_croisement'); assert.deepEqual(r.h, ['CLE-PUBLIQUE', 'Bearer JETON-PERSONNEL']); assert.deepEqual(r.corps, { p_contour: carre(5.349, -4.002, 5.351, -4.000) }); assert.equal(r.ok, 100);
  assert.match(r.sans, /Contour absent/); assert.match(r.e404, /foncier_territoire_exact\.sql/); assert.match(r.e401, /Session du personnel/); assert.match(r.e500, /indisponible \(500\)/); assert.match(r.acces, /Session du personnel/); assert.match(r.contour, /Contour invalide/); assert.equal(r.autre, 'boum'); assert.match(r.invalide, /Réponse du serveur invalide/); assert.match(r.horsligne, /injoignable/);
});

test('audit : résultat enregistré sur un audit en cours, affiché sans être enregistré sur un audit décidé ; panneau, bouton, impression, journal', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, ct, ex, P }) => {
    new Function('(' + st + ')()')(); var o = {}; window.SB = { url: 'https://exemple.supabase.co', key: 'K' }; window.sbAuth = function () { return 'J'; };
    window.fetch = async function () { return new Response(JSON.stringify(ex), { status: 200 }); };
    DATA.parcelles = [{ id: 'p1', ref: 'P-1', geo_polygon: P }]; DATA.couches_territoriales = [{ id: 'c1', reference: 'COU-1', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel', source: 'X', date_source: '2023-01-01', actif: true }]; DATA.zones_territoriales = [];
    var cible = JSON.stringify(ct); DATA.audits_fonciers = [{ id: 'a1', reference: 'AUD-1', parcelle_id: 'p1', zone: 'rural', points: {}, visas: {}, decision: 'en_attente', historique: [], controle_territorial: JSON.parse(cible) }, { id: 'a2', reference: 'AUD-2', parcelle_id: 'p1', zone: 'rural', points: {}, visas: {}, decision: 'go', historique: [], controle_territorial: JSON.parse(cible) }, { id: 'a3', reference: 'AUD-3', parcelle_id: 'p1', zone: 'rural', points: {}, visas: {}, decision: 'en_attente', historique: [] }];
    var h0 = fonTerritoireAuditHtml(DATA.audits_fonciers[0]); o.bouton = /Calcul exact \(serveur\)/.test(h0) && /fonTerritoireAuditExact\('a1'\)/.test(h0); o.avantBloc = /Estimé/.test(h0);
    await fonTerritoireAuditExact('a1'); var a1 = DATA.audits_fonciers[0]; o.enr = [!!a1.controle_territorial.exact, a1.controle_territorial.exact.croisements.length, a1.controle_territorial.exact.par !== undefined, a1.controle_territorial.croisements.length]; o.histo = (a1.historique || []).some(function (x) { return /CALCUL_EXACT/.test(JSON.stringify(x)); });
    var h1 = fonTerritoireAuditHtml(a1); o.panneau = [/PostGIS 3\.3\.7/.test(h1), /Estimé/.test(h1), h1.indexOf('<b>A</b>') === -1];
    window.__T = []; await fonTerritoireAuditExact('a2'); var a2 = DATA.audits_fonciers[1]; o.decide = [!a2.controle_territorial.exact, !!FON_TER.exactTmp.a2, /non enregistré/.test(window.__T.join(' ')), /PostGIS/.test(fonTerritoireAuditHtml(a2))];
    window.__T = []; await fonTerritoireAuditExact('a3'); o.sansControle = window.__T.join(' ');
    var impr = fonTerritoireControleImpression(a1); o.impr = [/Calcul exact/.test(impr), /PostGIS 3\.3\.7/.test(impr)]; o.imprSans = /Calcul exact/.test(fonTerritoireControleImpression(DATA.audits_fonciers[1]));
    o.log = window.__LOG.filter(function (x) { return /FONCIER_TERRITOIRE_EXACT/.test(x); }).length; o.ouvertures = window.__OUV;
    window.fetch = async function () { return new Response('{}', { status: 404 }); }; window.__T = []; await fonTerritoireAuditExact('a1'); o.erreur = [window.__T.join(' '), !!DATA.audits_fonciers[0].controle_territorial.exact]; return o;
  }, { st: stub.toString(), ct: CT(), ex: EX(), P: carre(5.349, -4.002, 5.351, -4.000) });
  assert.equal(r.bouton, true); assert.equal(r.avantBloc, false); assert.deepEqual(r.enr, [true, 2, true, 2]); assert.equal(r.histo, true); assert.deepEqual(r.panneau, [true, true, true]);
  assert.deepEqual(r.decide, [true, true, true, true]); assert.match(r.sansControle, /Lancez d'abord le contrôle territorial/); assert.deepEqual(r.impr, [true, true]); assert.equal(r.imprSans, false); assert.equal(r.log, 2); assert.ok(r.ouvertures >= 2); assert.match(r.erreur[0], /foncier_territoire_exact\.sql/); assert.equal(r.erreur[1], true);
});

test('carte : calcul exact d\'une parcelle contrôlée, affiché dans le panneau', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, ex, P }) => {
    new Function('(' + st + ')()')(); var o = {}; window.SB = { url: 'https://exemple.supabase.co', key: 'K' }; window.sbAuth = function () { return 'J'; };
    window.fetch = async function () { return new Response(JSON.stringify(ex), { status: 200 }); };
    DATA.parcelles = [{ id: 'p1', ref: 'P-1', geo_polygon: P }, { id: 'p2', ref: 'P-2' }]; DATA.couches_territoriales = [{ id: 'c1', reference: 'COU-1', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel', source: 'X', date_source: '2023-01-01', actif: true }];
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'c1', nom: 'Réserve A', categorie: 'interdit', anneaux: [[[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]], bbox: [5.348, -4.004, 5.353, -3.998] }]; FON_TER.alertes = {};
    fonTerritoireControlerParcelle('p1'); var avant = fonTerritoirePanneauHtml(); o.bouton = /fonTerritoireControleExact\('p1'\)/.test(avant); o.sansExact = /Estimé/.test(avant);
    await fonTerritoireControleExact('p1'); var ap = fonTerritoirePanneauHtml(); o.apres = [/PostGIS 3\.3\.7/.test(ap), /Estimé/.test(ap)]; o.maj = window.__MAJ >= 1;
    fonTerritoireControlerParcelle('p2'); o.sansContour = /Calcul exact \(serveur\)/.test(fonTerritoirePanneauHtml()); window.__T = []; await fonTerritoireControleExact('inconnue'); o.inconnue = window.__T.length; return o;
  }, { st: stub.toString(), ex: EX(), P: carre(5.349, -4.002, 5.351, -4.000) });
  assert.equal(r.bouton, true); assert.equal(r.sansExact, false); assert.deepEqual(r.apres, [true, true]); assert.equal(r.maj, true); assert.equal(r.sansContour, false); assert.equal(r.inconnue, 0);
});

test('SQL : fonction réservée au personnel, SECURITY INVOKER, droits réduits, mêmes règles que l\'ERP', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'foncier_territoire_exact.sql'), 'utf8').split('-- ── Retour arrière')[0];
  assert.match(sql, /create or replace function public\.fc_territoire_croisement\(p_contour jsonb\)/); assert.doesNotMatch(sql, /security definer/i); assert.match(sql, /auth\.jwt\(\) ->> 'app_role'/);
  assert.match(sql, /revoke all on function public\.fc_territoire_croisement\(jsonb\) from public, anon/); assert.match(sql, /grant execute on function public\.fc_territoire_croisement\(jsonb\) to authenticated/); assert.match(sql, /revoke all on function public\.fc_zone_geom\(jsonb\) from public, anon/);
  assert.match(sql, /'obsolete'/); assert.match(sql, /'À renseigner'/); assert.match(sql, /greatest\(5, v_aire \* 0\.001\)/); assert.match(sql, /v_pct >= 1 then 'critique'/); assert.match(sql, /v_pct >= 5 then 'majeur'/); assert.match(sql, /::geography/); assert.match(sql, /> 2000/);
});
