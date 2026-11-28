/* Rapport stratégique du portefeuille : risque territorial et actions proposées. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.dbPut = async function () { return true; }; window.fcDb = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {}; window.logAction = async function () {};
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const PREP = () => {
  var src = { source: 'Décret', date_source: '2023-01-01' };
  DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', reference: 'COU-2', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src)];
  var z = function (id, cid, nom, cat, rg) { return { id: id, couche_id: cid, nom: nom, categorie: cat, anneaux: [rg], bbox: [5.3, -4.1, 5.5, -3.8] }; };
  DATA.zones_territoriales = [z('z1', 'cp', 'Réserve A', 'interdit', [[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]), z('z2', 'cz', 'ZAD B', 'sous_condition', [[5.356, -4.002], [5.356, -3.996], [5.360, -3.996], [5.360, -4.002]])];
  DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; DATA.secteurs_veille = []; FON_TER_BADGE.cache = {};
};

test('rapport : section risque territorial (comptes, secteurs), actions critique et majeure classées, mentions, texte brut', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st, pr, P1, P2, P3 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    var base = { statut: 'acquis', superficie: 5000, prix_acq: 1000000, date_acquisition: '2026-10-01', programme_id: '' };
    DATA.parcelles = [Object.assign({ id: 'p1', ref: 'P-CRIT', geo_polygon: P1 }, base), Object.assign({ id: 'p2', ref: 'P-MAJ', geo_polygon: P2 }, base), Object.assign({ id: 'p3', ref: 'P-RIEN', geo_polygon: P3 }, base), Object.assign({ id: 'p4', ref: 'P-SANS', statut: 'acquis', superficie: 100 }, {})];
    DATA.secteurs_veille = [{ id: 's1', nom: 'Ahoué', actif: true, non_lu: true }, { id: 's2', nom: 'Brofodoumé', actif: true }, { id: 's3', nom: 'Suspendu', actif: false, non_lu: true }];
    var t = pfTerritoireCollecter(); o.t = { couches: t.couches, an: t.analysees, c: t.critique.length, m: t.majeur.length, info: t.info, aucun: t.aucun, sans: t.sansContour, sec: t.secteurs, ex: t.secteursAExaminer.length };
    var txt = _pfTexteRapport(); o.txt = txt; var A = _pfActions(Object.assign(_pfCollecter(), { territoire: pfTerritoireCollecter() })); o.actions = A.map(function (a) { return a.p + ':' + a.titre; }).filter(function (x) { return /territori|secteurs/i.test(x); });
    DATA.couches_territoriales.forEach(function (c) { c.actif = false; }); FON_TER_BADGE.cache = {}; o.sansCouche = _pfTexteRapport();
    o.sansT = (function () { var rr = _pfCollecter(); return _pfActions(rr).length >= 0; })(); return o;
  }, { st: stub.toString(), pr: PREP.toString(), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.deepEqual(r.t, { couches: 2, an: 3, c: 1, m: 1, info: 0, aucun: 1, sans: 1, sec: 2, ex: 1 });
  assert.match(r.txt, /▸ RISQUE TERRITORIAL \(indicatif\)/); assert.match(r.txt, /2 couche\(s\) officielle\(s\) contrôlée\(s\) · 3 parcelle\(s\) analysée\(s\) · 1 sans contour/); assert.match(r.txt, /Critique : 1 · Majeur : 1 · Information : 0 · Aucun croisement : 1/);
  assert.match(r.txt, /Secteurs surveillés : 2, dont 1 à examiner/); assert.match(r.txt, /n'autorise rien/); assert.match(r.txt, /Lever les croisements territoriaux critiques/); assert.match(r.txt, /P-CRIT[^\n]*Réserve A/); assert.match(r.txt, /Examiner les croisements territoriaux majeurs/); assert.match(r.txt, /Examiner les secteurs surveillés/);
  assert.deepEqual(r.actions, ['96:Lever les croisements territoriaux critiques', '82:Examiner les secteurs surveillés où une couche a changé', '75:Examiner les croisements territoriaux majeurs']);
  assert.match(r.sansCouche, /Aucune couche territoriale active : contrôle impossible/); assert.match(r.sansCouche, /Charger les couches territoriales/); assert.doesNotMatch(r.sansCouche, /Lever les croisements/);
});

test('rapport sans parcelle ou sans donnée territoriale : inchangé, aucune erreur', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {}; DATA.parcelles = []; DATA.couches_territoriales = []; DATA.zones_territoriales = []; DATA.secteurs_veille = [];
    o.vide = _pfTexteRapport(); var t = pfTerritoireCollecter(); o.t = [t.couches, t.analysees, t.secteurs];
    DATA.parcelles = [{ id: 'q1', ref: 'Q-1', statut: 'prospection', superficie: 1000 }]; o.sans = _pfTexteRapport(); return o;
  }, { st: stub.toString() });
  assert.match(r.vide, /Aucune parcelle au portefeuille/); assert.deepEqual(r.t, [0, 0, 0]); assert.match(r.sans, /Aucune couche territoriale active/); assert.doesNotMatch(r.sans, /Charger les couches territoriales/);   /* pas de contour à contrôler : pas d'action inutile */
});
