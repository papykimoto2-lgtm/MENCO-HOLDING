/* Foncier — rapport territorial imprimable : section de l'audit et rapport pour la direction. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {}; window.confirm = function () { return true; };
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); };
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const DONNEES = () => {
  var src = { source: 'Décret <test>', date_source: '2023-01-01' };
  DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', reference: 'COU-2', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src)];
  return src;
};

test('section de l\'audit : couches, croisements, dérogation, texte échappé ; contrôle non lancé = mention explicite', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {};
    var ct = { le: '2026-11-28T10:00:00Z', par: 'Auditeur <b>x</b>', ref: 'P-1', contour: true, aire_m2: 5000,
      couches: [{ reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', source: 'Décret <img src=x>', date_source: '2023-01-01', version: '3', statut: 'officiel' }],
      croisements: [{ niveau: 'critique', zone_nom: 'Réserve <script>', couche_nom: 'Forêts classées', version: '3', statut: 'officiel', categorie: 'interdit', pct: 12.5, m2: 625, point: 'AUD-JUR-03' }] };
    o.avec = fonTerritoireControleImpression({ controle_territorial: ct, derogation_territoriale: { motif: 'Accord DG <i>', par: 'Admin', le: '2026-11-29' } });
    o.sans = fonTerritoireControleImpression({}); o.aucun = fonTerritoireControleImpression({ controle_territorial: { le: '2026-11-28T10:00:00Z', par: 'A', ref: 'P', contour: true, aire_m2: 10, couches: [], croisements: [] } });
    o.sansContour = fonTerritoireControleImpression({ controle_territorial: { le: '2026-11-28T10:00:00Z', par: 'A', ref: 'P', contour: false, aire_m2: 0, couches: [], croisements: [] } });
    return o;
  }, { st: stub.toString() });
  assert.match(r.avec, /Critique/); assert.match(r.avec, /12\.5 %/); assert.match(r.avec, /AUD-JUR-03/); assert.match(r.avec, /Dérogation territoriale/); assert.match(r.avec, /n'autorise rien|n&#39;autorise rien/);
  for (const brut of ['<script>', '<img src=x>', '<b>x</b>', '<i>']) assert.ok(!r.avec.includes(brut), 'non échappé : ' + brut);
  assert.match(r.sans, /non lancé/); assert.match(r.sans, /ne vaut pas conformité/); assert.match(r.aucun, /Aucun croisement[\s\S]*ne vaut pas conformité/); assert.match(r.sansContour, /Moins de 3 bornes/);
});

test('impression de l\'audit : la section territoriale est présente avant la décision du comité', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {}, ecrit = '';
    window.open = function () { return { document: { write: function (h) { ecrit += h; }, close: function () {} } }; };
    DATA.audits_fonciers = [{ id: 'a1', reference: 'AUD-1', zone: 'rural', points: {}, visas: {}, decision: 'en_attente', historique: [],
      controle_territorial: { le: '2026-11-28T10:00:00Z', par: 'Aud', ref: 'P-1', contour: true, aire_m2: 100, couches: [], croisements: [{ niveau: 'majeur', zone_nom: 'ZAD B', couche_nom: 'ZAD', version: '1', statut: 'indicatif', categorie: 'sous_condition', pct: 30, m2: 30, point: 'AUD-TECH-03' }] } }];
    fonAuditImprimer('a1'); o.h = ecrit; o.ordre = ecrit.indexOf('Contrôle territorial') > ecrit.indexOf('Code</th>') && ecrit.indexOf('Contrôle territorial') < ecrit.indexOf('Décision du comité'); return o;
  }, { st: stub.toString() });
  assert.equal(r.ordre, true); assert.match(r.h, /ZAD B/); assert.match(r.h, /window\.print/);
});

test('rapport direction : synthèse, parcelles critiques en premier, sans croisement et non contrôlables listés, rien d\'enregistré', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, A, B, P1, P2, P3 }) => {
    new Function('(' + st + ')()')(); var o = {}, ecrit = '';
    (function () { var src = { source: 'Décret <test>', date_source: '2023-01-01' };
      DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', reference: 'COU-2', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src)]; })();
    var z = function (id, cid, nom, cat, rg) { return { id: id, couche_id: cid, nom: nom, categorie: cat, anneaux: [rg], bbox: [5.3, -4.1, 5.5, -3.8] }; };
    DATA.zones_territoriales = [z('z1', 'cp', 'Réserve A', 'interdit', A), z('z2', 'cz', 'ZAD B', 'sous_condition', B)];
    DATA.parcelles = [{ id: 'p2', ref: 'P-MAJ <b>', statut: 'acquis', geo_polygon: P2 }, { id: 'p1', ref: 'P-CRIT', statut: 'acquis', geo_polygon: P1 }, { id: 'p3', ref: 'P-RIEN', statut: 'acquis', geo_polygon: P3 }, { id: 'p4', ref: 'P-SANS', statut: 'acquis' }];
    DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; FON_TER.alertes = {};
    var avant = JSON.stringify(DATA.audits_fonciers || []);
    window.open = function () { return { document: { write: function (h) { ecrit += h; }, close: function () {} }, close: function () {} }; };
    await fonTerritoireRapport(); o.h = ecrit; o.log = window.__LOG.join('|'); o.rien = JSON.stringify(DATA.audits_fonciers || []) === avant;
    ecrit = ''; window.open = function () { return null; }; window.__T = []; await fonTerritoireRapport(); o.bloque = window.__T.join(' ') + '|' + ecrit.length;
    FON_TER.alertes = {}; DATA.couches_territoriales.forEach(function (c) { c.actif = false; }); window.__T = []; await fonTerritoireRapport(); o.sansCouche = window.__T.join(' ');
    return o;
  }, { st: stub.toString(), A: carre(5.348, -4.004, 5.353, -3.998), B: carre(5.356, -4.002, 5.360, -3.996), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.match(r.h, /Rapport de contrôle territorial/); assert.match(r.h, /3 parcelle\(s\) analysée\(s\)/); assert.match(r.h, /Forêts classées/); assert.match(r.h, /Décret &lt;test&gt;/);
  assert.ok(r.h.indexOf('P-CRIT') < r.h.indexOf('P-MAJ'), 'critique avant majeur'); assert.match(r.h, /P-MAJ &lt;b&gt;/); assert.doesNotMatch(r.h, /P-MAJ <b>/);
  assert.match(r.h, /Sans croisement \(1\) :[^.]*P-RIEN/); assert.match(r.h, /Non contrôlables[^:]*\(1\) :[^.]*P-SANS/); assert.match(r.h, /Validé par \(direction\)/); assert.match(r.h, /window\.print/); assert.match(r.h, /ne vaut pas conformité/);
  assert.match(r.log, /FONCIER_TERRITOIRE_RAPPORT/); assert.equal(r.rien, true); assert.match(r.bloque, /bloquée[\s\S]*\|0$/); assert.match(r.sansCouche, /Aucune couche active/);
});

test('versions d\'une couche : zones ajoutées, retirées, modifiées ; audits touchés signalés sans jamais être modifiés ; historique échappé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, P1, P2 }) => {
    new Function('(' + st + ')()')(); var o = {};
    var poly = function (lat0, lng0, lat1, lng1) { return [[lng0, lat0], [lng1, lat0], [lng1, lat1], [lng0, lat1], [lng0, lat0]]; };
    var gj = function (feats) { return JSON.stringify({ type: 'FeatureCollection', features: feats.map(function (f) { return { type: 'Feature', properties: { nom: f[0] }, geometry: { type: 'Polygon', coordinates: [f[1]] } }; }) }); };
    DATA.couches_territoriales = [{ id: 'cp', reference: 'COU-1', nom: 'Forêts <b>classées</b>', type: 'protegee', version: '1', statut: 'officiel', source: 'Décret', date_source: '2023-01-01', actif: true }]; DATA.zones_territoriales = [];
    DATA.parcelles = [{ id: 'p1', ref: 'P-UN', statut: 'acquis', geo_polygon: P1 }, { id: 'p2', ref: 'P-DEUX', statut: 'acquis', geo_polygon: P2 }]; DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = [];
    await fonTerritoireImporter('cp', gj([['Réserve A', poly(5.348, -4.004, 5.353, -3.998)], ['Marais', poly(5.330, -4.000, 5.333, -3.996)]]));
    o.premier = JSON.stringify(DATA.couches_territoriales[0].historique_versions.map(function (h) { return [h.premiere, h.nb]; }));
    var c1 = fonTerritoireControle(DATA.parcelles[0]), c2 = fonTerritoireControle(DATA.parcelles[1]);
    DATA.audits_fonciers = [{ id: 'a1', reference: 'AUD-1', parcelle_id: 'p1', decision: 'go', controle_territorial: c1, historique: [] }, { id: 'a2', reference: 'AUD-2', parcelle_id: 'p2', decision: 'en_attente', controle_territorial: c2, historique: [] }];
    var figes = JSON.stringify(DATA.audits_fonciers); o.avantCroisement = [c1.croisements.length, c2.croisements.length];
    DATA.couches_territoriales[0].version = '2';
    await fonTerritoireImporter('cp', gj([['Réserve A', poly(5.340, -4.004, 5.343, -3.998)], ['Marais', poly(5.330, -4.000, 5.333, -3.996)], ['Nouvelle <i>zone</i>', poly(5.356, -4.002, 5.360, -3.996)]]));
    var h = DATA.couches_territoriales[0].historique_versions[0]; o.h = { premiere: h.premiere, av: h.version_avant, v: h.version, ajoutees: h.ajoutees, modifiees: h.modifiees, supprimees: h.supprimees, inchangees: h.inchangees, nb: h.audits_touches.length };
    o.touches = h.audits_touches.map(function (t) { return t.audit + ':' + t.decision + ':+' + t.nouveaux.length + ':-' + t.leves.length; }).sort().join('|');
    o.figes = JSON.stringify(DATA.audits_fonciers) === figes; o.toast = window.__T.join(' ');
    o.html = fonTerritoireHistoriqueHtml(DATA.couches_territoriales[0]); o.vide = fonTerritoireHistoriqueHtml({});
    return o;
  }, { st: stub.toString(), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999) });
  assert.equal(r.premier, '[[true,2]]'); assert.deepEqual(r.avantCroisement, [1, 0]);
  assert.deepEqual(r.h.ajoutees, ['Nouvelle <i>zone</i>']); assert.deepEqual(r.h.modifiees, ['Réserve A']); assert.deepEqual(r.h.supprimees, []); assert.equal(r.h.inchangees, 1); assert.equal(r.h.av, '1'); assert.equal(r.h.v, '2'); assert.equal(r.h.premiere, false);
  assert.equal(r.touches, 'AUD-1:go:+0:-1|AUD-2:en_attente:+1:-0'); assert.equal(r.figes, true); assert.match(r.toast, /2 audit\(s\) touché\(s\)/);
  assert.match(r.html, /v1 → v2/); assert.match(r.html, /Nouvelle &lt;i&gt;zone&lt;\/i&gt;/); assert.doesNotMatch(r.html, /<i>zone/); assert.match(r.html, /GO/); assert.match(r.html, /jamais modifiés/); assert.equal(r.vide, '');
});
