/* Foncier — alerte précoce : badge territorial des parcelles (liste, grille), cache, alerte à l'enregistrement. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m, t) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {};
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); };
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const PREP = () => {
  var src = { source: 'Décret', date_source: '2023-01-01' };
  DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', reference: 'COU-2', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src)];
  var z = function (id, cid, nom, cat, rg) { return { id: id, couche_id: cid, nom: nom, categorie: cat, anneaux: [rg], bbox: [5.3, -4.1, 5.5, -3.8] }; };
  DATA.zones_territoriales = [z('z1', 'cp', 'Réserve A', 'interdit', [[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]), z('z2', 'cz', 'ZAD B', 'sous_condition', [[5.356, -4.002], [5.356, -3.996], [5.360, -3.996], [5.360, -4.002]])];
  DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; FON_TER_BADGE.cache = {};
};

test('badge : critique, majeur, aucun croisement, contour à saisir, pas de couche ; cache réutilisé et invalidé quand les couches changent', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st, pr, P1, P2, P3 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    DATA.parcelles = [{ id: 'p1', ref: 'P-CRIT', geo_polygon: P1 }, { id: 'p2', ref: 'P-MAJ', geo_polygon: P2 }, { id: 'p3', ref: 'P-RIEN', geo_polygon: P3 }, { id: 'p4', ref: 'P-SANS' }];
    o.n = DATA.parcelles.map(function (p) { return fonTerritoireBadgeCalculer(p).niveau; }).join(',');
    FON_TER_BADGE.cache = {}; var appels = 0, orig = fonTerritoireControle; window.fonTerritoireControle = function (p) { appels++; return orig(p); };
    fonTerritoireBadgeCalculer(DATA.parcelles[0]); fonTerritoireBadgeCalculer(DATA.parcelles[0]); o.appelsCache = appels;
    DATA.couches_territoriales[1].actif = false; fonTerritoireBadgeCalculer(DATA.parcelles[1]); o.apresDesactivation = [appels, fonTerritoireBadgeCalculer(DATA.parcelles[1]).niveau];
    window.fonTerritoireControle = orig; DATA.couches_territoriales.forEach(function (c) { c.actif = false; }); o.sansCouche = fonTerritoireBadgeCalculer(DATA.parcelles[0]).niveau;
    return o;
  }, { st: stub.toString(), pr: PREP.toString(), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.equal(r.n, 'critique,majeur,aucun,contour'); assert.equal(r.appelsCache, 1); assert.deepEqual(r.apresDesactivation, [2, 'aucun']); assert.equal(r.sansCouche, 'sans');
});

test('liste et grille : colonne Territoire, témoin puis badge, texte échappé, mention « ne vaut pas conformité », clic = carte', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr, P1, P2, P3 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    DATA.parcelles = [{ id: 'p1', ref: 'P-CRIT <b>', statut: 'prospection', geo_polygon: P1 }, { id: 'p2', ref: 'P-MAJ', statut: 'prospection', geo_polygon: P2 }, { id: 'p3', ref: 'P-RIEN', statut: 'prospection', geo_polygon: P3 }, { id: 'p4', ref: 'P-SANS', statut: 'prospection' }];
    var fil = window.filiereLiveRefresh; window.filiereLiveRefresh = function () {};
    window._vueParcelles = 'tableau'; renderParcelles(); var tb = document.getElementById('tbody-parcelles');
    o.temoin = tb.querySelectorAll('.ter-badge[data-att="1"]').length; o.colonnes = [document.querySelectorAll('#parc-table-container thead th').length, tb.querySelector('tr').children.length];
    await new Promise(function (r) { setTimeout(r, 600); });
    var t = tb.textContent; o.restant = tb.querySelectorAll('.ter-badge[data-att="1"]').length; o.t = [/Critique/.test(t), /Majeur/.test(t), /Aucun croisement/.test(t), /Contour à saisir/.test(t)];
    var b = tb.querySelector('.ter-badge[data-ter="p3"]'); o.tip = b.getAttribute('title'); o.echappe = tb.innerHTML.indexOf('<b>') === -1 && tb.innerHTML.indexOf('P-CRIT &lt;b&gt;') !== -1;
    var cible = []; window.fonAller = function (c) { cible.push(c); }; tb.querySelector('.ter-badge[data-ter="p1"]').click(); o.clic = [FON_TER.focus, cible[0]];
    window._vueParcelles = 'grille'; renderParcelles(); await new Promise(function (r) { setTimeout(r, 400); }); o.grille = document.getElementById('parc-grid-container').textContent.indexOf('Critique') !== -1;
    return o;
  }, { st: stub.toString(), pr: PREP.toString(), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.equal(r.temoin, 4); assert.equal(r.colonnes[0], r.colonnes[1]); assert.equal(r.restant, 0); assert.deepEqual(r.t, [true, true, true, true]);
  assert.match(r.tip, /ne vaut pas conformité/); assert.match(r.tip, /n'autorise rien|n&#39;autorise rien/); assert.equal(r.echappe, true); assert.deepEqual(r.clic, ['p1', 'tab:territoire']); assert.equal(r.grille, true);
});

test('alerte à l\'enregistrement : avertissement si critique ou majeur (zone, couche, part), journalisé ; rien si aucun croisement, contour absent ou pas de couche', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr, P1, P2, P3 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {}, ps = [{ id: 'p1', ref: 'P-CRIT', geo_polygon: P1 }, { id: 'p2', ref: 'P-MAJ', geo_polygon: P2 }, { id: 'p3', ref: 'P-RIEN', geo_polygon: P3 }, { id: 'p4', ref: 'P-SANS' }];
    window.__T = []; window.__LOG = []; fonTerritoireAlerteParcelle(ps[0]); o.crit = window.__T.join(' '); o.log = window.__LOG.join('|');
    window.__T = []; fonTerritoireAlerteParcelle(ps[1]); o.maj = window.__T.join(' ');
    window.__T = []; fonTerritoireAlerteParcelle(ps[2]); fonTerritoireAlerteParcelle(ps[3]); o.rien = window.__T.length;
    DATA.couches_territoriales.forEach(function (c) { c.actif = false; }); window.__T = []; fonTerritoireAlerteParcelle(ps[0]); o.sansCouche = window.__T.length; o.nul = fonTerritoireAlerteParcelle(null);
    return o;
  }, { st: stub.toString(), pr: PREP.toString(), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.match(r.crit, /CRITIQUE/); assert.match(r.crit, /Réserve A/); assert.match(r.crit, /Forêts classées/); assert.match(r.crit, /\d+(\.\d+)? %/); assert.match(r.crit, /Indicatif/); assert.match(r.log, /FONCIER_ALERTE_TERRITORIALE P-CRIT : critique/);
  assert.match(r.maj, /majeur/); assert.match(r.maj, /ZAD B/); assert.equal(r.rien, 0); assert.equal(r.sansCouche, 0); assert.equal(r.nul, null);
});

test('l\'enregistrement d\'une parcelle appelle l\'alerte territoriale sans jamais la bloquer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'menko-immo.html'), 'utf8'), i = src.indexOf('async function saveParcelle() {'), j = src.indexOf('async function deleteParcelle', i);
  const corps = src.slice(i, j); assert.match(corps, /toast\('Parcelle enregistrée\.', 'success'\);\s*try \{ fonTerritoireAlerteParcelle\(p\); \} catch/);
});
