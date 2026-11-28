/* Foncier — import de relevé de bornes (géomètre) : lecture, contrôles, aperçu, application avec historique. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.dbPut = async function (s, r) { (window.__PUT = window.__PUT || []).push(s + ':' + (r && r.ref)); return true; }; window.fcDb = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {};
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); }; window.fcEstAdmin = function () { return window.__ADMIN !== false; }; window.renderParcelles = function () {};
};
/* carré de côté c (m) en UTM 30 autour d'un point d'Abidjan, sous forme de lignes CSV */
const OUTILS = () => {
  window.__base = latLngToUtm(5.35, -4.0, 30);
  window.__carre = function (ref, c, dx, dy, nom0) { var E0 = Math.round(__base.E + (dx || 0)), N0 = Math.round(__base.N + (dy || 0)); return [[E0, N0], [E0 + c, N0], [E0 + c, N0 + c], [E0, N0 + c]].map(function (q, i) { return [ref, (nom0 || 'B') + (i + 1), q[0] + '.50', q[1] + '.25', '42.1'].join(';'); }); };
  window.__csv = function (lignes) { return 'parcelle;borne;x;y;z\n' + lignes.join('\n'); };
  DATA.parcelles = [{ id: 'p1', ref: 'P-001', superficie: 10000, statut: 'prospection' }, { id: 'p2', ref: 'P-002', superficie: 10000, statut: 'prospection', utm_zone: 30, bornes: [{ nom: 'B1', x: Math.round(__base.E) + 50, y: Math.round(__base.N) + 50 }, { nom: 'B2', x: Math.round(__base.E) + 150, y: Math.round(__base.N) + 50 }, { nom: 'B3', x: Math.round(__base.E) + 150, y: Math.round(__base.N) + 150 }, { nom: 'B4', x: Math.round(__base.E) + 50, y: Math.round(__base.N) + 150 }] }, { id: 'p3', ref: 'P-003', superficie: 5000, statut: 'prospection' }];
  DATA.couches_territoriales = []; DATA.zones_territoriales = []; DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; FON_TER_BADGE.cache = {};
};

test('lecture : séparateurs ; , tabulation, BOM, guillemets, virgule décimale, en-têtes usuels, lat/lng, zone, cellules numériques d\'Excel, erreurs de colonnes', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(() => {
    var o = {}, n = function (res) { return res.lignes.map(function (l) { return [l.parcelle, l.borne, l.x, l.y, l.zone].join('/'); }).join('|'); };
    o.pv = n(fonReleveParser('parcelle;borne;x;y\nP1;B1;395 120,50;590210,25\nP1;B2;395180.1;590215.8')); o.virgule = n(fonReleveParser('﻿parcelle,borne,x,y\n"P,1","B 1",395120.5,590210.25'));
    o.tab = n(fonReleveParser('Réf.\tPoint\tEst\tNord\tAltitude\nP2\tA\t1\t2\t3')); o.alias = fonReleveParser('Réf.\tPoint\tEst\tNord\tAltitude\nP2\tA\t1\t2\t3').lignes[0].z;
    var g = fonReleveParser('parcelle;borne;lat;lng;zone\nP3;B1;5,35;-4,0;29'); o.geo = [g.lignes[0].lat, g.lignes[0].lng, g.lignes[0].zone, g.lignes[0].x];
    o.zoneDefaut = [fonReleveParser('parcelle;x;y\nP;1;2', 29).lignes[0].zone, fonReleveParser('parcelle;x;y\nP;1;2').lignes[0].zone];
    o.excel = fonReleveDepuisTableau([['parcelle', 'borne', 'x', 'y'], ['P4', 'B1', 395120.5, 590210.25]]).lignes[0].x;
    o.errCol = [fonReleveParser('borne;x;y\nB1;1;2').erreurs[0], fonReleveParser('parcelle;borne\nP;B1').erreurs[0], fonReleveParser('').erreurs[0]];
    o.nombres = [fonReleveNombre('1.234,5'), fonReleveNombre('12,5'), fonReleveNombre('abc'), fonReleveNombre('')]; return o;
  });
  assert.equal(r.pv, 'P1/B1/395120.5/590210.25/30|P1/B2/395180.1/590215.8/30'); assert.equal(r.virgule, 'P,1/B 1/395120.5/590210.25/30'); assert.equal(r.tab, 'P2/A/1/2/30'); assert.equal(r.alias, 3);
  assert.deepEqual(r.geo, [5.35, -4, 29, undefined]); assert.deepEqual(r.zoneDefaut, [29, 30]); assert.equal(r.excel, 395120.5);
  assert.match(r.errCol[0], /Colonne « parcelle » introuvable/); assert.match(r.errCol[1], /Coordonnées introuvables/); assert.match(r.errCol[2], /Fichier vide/); assert.equal(r.nombres[0], 1234.5); assert.equal(r.nombres[1], 12.5); assert.ok(isNaN(r.nombres[2]) && isNaN(r.nombres[3]));
});

test('contrôles : parcelle introuvable, moins de 3 bornes, hors pays (x/y inversés), contour croisé, fermeture et doublons, écart de surface, chevauchement (administrateur ou refus)', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st, ou }) => {
    new Function('(' + st + ')()')(); new Function('(' + ou + ')()')(); var o = {};
    var an = function (l, admin) { window.__ADMIN = admin !== false; return fonReleveAnalyser(fonReleveParser(__csv(l)).lignes); };
    var ok = an(__carre('P-001', 100, 1000, 1000))[0]; o.ok = [ok.erreurs.length, ok.avertissements.length, ok.aire_m2, ok.nb, ok.bornes[0].nom];
    o.inconnu = an(__carre('P-999', 100))[0].erreurs[0]; o.deux = an(__carre('P-001', 100).slice(0, 2))[0].erreurs[0];
    var hors = an(['P-001;B1;1000.5;2000.25;', 'P-001;B2;1100.5;2000.25;', 'P-001;B3;1100.5;2100.25;'])[0].erreurs; o.hors = hors.length && /hors de la Côte d'Ivoire/.test(hors[0]); var base = Math.round(__base.E), basN = Math.round(__base.N);
    o.inverse = /inversés/.test(an(['P-001;B1;' + basN + ';' + base + ';', 'P-001;B2;' + (basN + 100) + ';' + base + ';', 'P-001;B3;' + (basN + 100) + ';' + (base + 100) + ';'])[0].erreurs[0]);
    var l = __carre('P-001', 100, 3000, 3000); var croise = an([l[0], l[2], l[1], l[3]])[0]; o.croise = croise.erreurs.join();
    var ferm = an(__carre('P-001', 100, 3000, 3000).concat([__carre('P-001', 100, 3000, 3000)[0].replace('B1', 'B5')]))[0]; o.ferm = [ferm.nb, ferm.bornes.length, /fermeture/.test(ferm.avertissements.join())];
    var dbl = an(__carre('P-001', 100, 3000, 3000).map(function (x) { return x.replace(/;B\d;/, ';B1;'); }))[0]; o.dbl = /en double/.test(dbl.avertissements.join());
    var ecart = an(__carre('P-001', 50, 5000, 5000))[0]; o.ecart = [ecart.erreurs.length, ecart.ecart_pct, /écart/.test(ecart.avertissements.join())];
    var chev = an(__carre('P-003', 100, 80, 80), false)[0]; o.chevNon = [chev.erreurs.length, /P-002/.test(chev.erreurs.join()), chev.bloque_chevauchement, chev.chevauchements.length];
    var chevA = an(__carre('P-003', 100, 80, 80), true)[0]; o.chevAdmin = [chevA.erreurs.length, /administrateur, motif/.test(chevA.avertissements.join())];
    DATA.couches_territoriales = [{ id: 'cp', reference: 'COU-1', nom: 'Forêts', type: 'protegee', version: '1', statut: 'officiel', source: 'X', date_source: '2023-01-01', actif: true }];
    var u = function (E, N) { var q = utm30ToLatLng(E, N, 30); return [q[0], q[1]]; }; var a = u(base + 4000 - 500, basN + 4000 - 500), b = u(base + 4000 + 700, basN + 4000 + 700);
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve', categorie: 'interdit', anneaux: [[[a[0], a[1]], [a[0], b[1]], [b[0], b[1]], [b[0], a[1]]]], bbox: [a[0], a[1], b[0], b[1]] }]; FON_TER_BADGE.cache = {};
    o.terr = an(__carre('P-001', 100, 4000, 4000))[0].territoire; return o;
  }, { st: stub.toString(), ou: OUTILS.toString() });
  assert.deepEqual(r.ok, [0, 0, 10000, 4, 'B1']); assert.match(r.inconnu, /introuvable/); assert.match(r.deux, /3 bornes au moins/); assert.equal(r.hors, true); assert.equal(r.inverse, true); assert.match(r.croise, /Contour croisé/);
  assert.deepEqual(r.ferm, [5, 4, true]); assert.equal(r.dbl, true); assert.deepEqual(r.ecart, [0, -75, true]); assert.deepEqual(r.chevNon, [1, true, true, 1]); assert.deepEqual(r.chevAdmin, [0, true]); assert.equal(r.terr.niveau, 'critique');
});

test('application : bornes et contour remplacés, ancien contour conservé (5 versions), historique et journal ; superficie en option ; refus sans droit ; chevauchement : administrateur et motif', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, ou }) => {
    new Function('(' + st + ')()')(); new Function('(' + ou + ')()')(); var o = {}; window.__PUT = []; window.__ADMIN = true;
    var an = function (l) { return fonReleveAnalyser(fonReleveParser(__csv(l)).lignes); };
    var A = an(__carre('P-001', 100, 1000, 1000).concat(__carre('P-003', 60, 2000, 2000)));
    o.avant = JSON.stringify(DATA.parcelles[0].bornes || null);
    var res = await fonReleveAppliquer(A, {}); var p1 = DATA.parcelles[0], p3 = DATA.parcelles[2];
    o.res = res.appliquees; o.bornes = [p1.bornes.length, p1.bornes[0].nom, p1.utm_zone, p1.geo_polygon.length, p1.systeme_geodesique, p1.superficie, p3.superficie]; o.histo = [(p1.historique_bornes || []).length, p1.historique_bornes[0].nb, (p1.historique || []).slice(-1)[0].action]; o.put = window.__PUT.join(','); o.log = window.__LOG.join('|');
    o.zRetenu = p1.bornes[0].z;
    for (var i = 0; i < 6; i++) { await fonReleveAppliquer(an(__carre('P-001', 100 + i, 1000, 1000)), {}); } o.cinq = DATA.parcelles[0].historique_bornes.length;
    await fonReleveAppliquer(an(__carre('P-001', 100, 1000, 1000)), { superficie: true }); o.superficie = DATA.parcelles[0].superficie;
    window.fcDroitEcriture = function () { return false; }; var avant = JSON.stringify(DATA.parcelles[2].bornes); window.__T = []; var nul = await fonReleveAppliquer(an(__carre('P-003', 60, 2500, 2500)), {}); o.sansDroit = [nul, JSON.stringify(DATA.parcelles[2].bornes) === avant, window.__T.join(' ')]; window.fcDroitEcriture = function () { return true; };
    var chev = an(__carre('P-003', 100, 80, 80)); window.__ADMIN = true; var chevAdm = an(__carre('P-003', 100, 80, 80)); window.prompt = function () { return 'court'; }; window.__T = []; o.motifCourt = [await fonReleveAppliquer(chevAdm, {}), window.__T.join(' ')];
    window.prompt = function () { return 'Accord du comité foncier du 28/11'; }; var ap = await fonReleveAppliquer(chevAdm, {}); o.motif = [ap && ap.appliquees, /chevauchement : Accord/.test(window.__LOG.slice(-1)[0]), /chevauchement accepté/.test(DATA.parcelles[2].historique.slice(-1)[0].detail)];
    window.__ADMIN = false; var chevNon = an(__carre('P-003', 100, 80, 80)); o.nonAdmin = [chevNon[0].erreurs.length, await fonReleveAppliquer(chevNon, {})];
    return o;
  }, { st: stub.toString(), ou: OUTILS.toString() });
  assert.equal(r.avant, 'null'); assert.equal(r.res, 2); assert.deepEqual(r.bornes.slice(0, 5), [4, 'B1', 30, 4, 'UTM30N-WGS84 (relevé importé)']); assert.equal(r.bornes[5], 10000); assert.equal(r.bornes[6], 5000);
  assert.deepEqual(r.histo, [1, 0, 'Relevé de bornes importé']); assert.match(r.put, /parcelles:P-001,parcelles:P-003/); assert.match(r.log, /FONCIER_RELEVE_BORNES 2 parcelle\(s\) : P-001, P-003/); assert.equal(r.zRetenu, 42.1); assert.equal(r.cinq, 5); assert.equal(r.superficie, 10000);
  assert.deepEqual(r.sansDroit.slice(0, 2), [null, true]); assert.match(r.sansDroit[2], /ne permet pas/); assert.equal(r.motifCourt[0], null); assert.match(r.motifCourt[1], /10 caractères/); assert.deepEqual(r.motif, [1, true, true]); assert.deepEqual(r.nonAdmin, [1, null]);
});

test('écran : modèle CSV, aperçu (prête, refusée, avertissements, texte échappé), application et message final', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, ou }) => {
    new Function('(' + st + ')()')(); new Function('(' + ou + ')()')(); var o = {}; window.__ADMIN = true; window.__PUT = [];
    var tel = []; var orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { tel.push(this.download); }; fonReleveModele(); HTMLAnchorElement.prototype.click = orig; o.modele = tel[0];
    fonReleveOuvrir(); o.ouvert = document.getElementById('modal-releve').classList.contains('open'); o.champs = ['releve-fichier', 'releve-texte', 'releve-zone'].map(function (i) { return !!document.getElementById(i); });
    document.getElementById('releve-texte').value = __csv(__carre('P-001', 100, 1000, 1000).concat(__carre('P-<b>9</b>', 100, 2000, 2000)).concat(__carre('P-003', 20, 3000, 3000)));
    await fonReleveAnalyserUI(); var h = document.getElementById('releve-apercu').innerHTML; o.h = h; o.n = FON_RELEVE.analyses.length;
    document.getElementById('releve-texte').value = 'borne;x;y\nB1;1;2'; await fonReleveAnalyserUI(); o.erreur = document.getElementById('releve-apercu').textContent;
    document.getElementById('releve-texte').value = __csv(__carre('P-001', 100, 1000, 1000)); await fonReleveAnalyserUI(); document.getElementById('releve-superficie').checked = true; await fonReleveAppliquerUI();
    o.final = document.getElementById('releve-apercu').textContent; o.sup = DATA.parcelles[0].superficie; o.reste = FON_RELEVE.analyses; return o;
  }, { st: stub.toString(), ou: OUTILS.toString() });
  assert.equal(r.modele, 'modele-releve-bornes.csv'); assert.equal(r.ouvert, true); assert.deepEqual(r.champs, [true, true, true]); assert.equal(r.n, 3);
  assert.match(r.h, /3 parcelle\(s\) lue\(s\)/); assert.match(r.h, /✅ prête/); assert.match(r.h, /introuvable/); assert.match(r.h, /P-&lt;b&gt;9&lt;\/b&gt;/); assert.doesNotMatch(r.h, /<b>9<\/b>/); assert.match(r.h, /Appliquer à 2 parcelle/); assert.match(r.h, /géomètre fait foi/);
  assert.match(r.erreur, /Colonne « parcelle » introuvable/); assert.match(r.final, /1 parcelle\(s\) mise\(s\) à jour/); assert.equal(r.sup, 10000); assert.equal(r.reste, null);
});
