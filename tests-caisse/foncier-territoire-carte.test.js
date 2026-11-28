/* Foncier L18 — carte 3D du Territoire (MapLibre) : rendu réel hors ligne (fond uni), données, couches, options, contrôle et analyse. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

const MAPLIBRE = process.env.MAPLIBRE_DIST || path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dispo = fs.existsSync(path.join(MAPLIBRE, 'maplibre-gl.js'));
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.dbDelete = async function () { return true; }; window.deleteFromSupabase = function () {};
  window.syncToSupabase = function () {}; window.logAction = function () {}; window.confirm = function () { return true; };
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];

async function preparer(page) {
  await page.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await page.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await page.evaluate(async ({ st, A, B, C, P1, P2, P3 }) => {
    new Function('(' + st + ')()')();
    window.__FON_TER_STYLE_HORS_LIGNE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }] };   /* aucun réseau dans les tests */
    var src = { source: 'Décret test', date_source: '2023-01-01' };
    DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', reference: 'COU-2', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src), Object.assign({ id: 'ci', reference: 'COU-3', nom: 'Inactive', type: 'hydrologie', version: '1', statut: 'projet', actif: false }, src)];
    var z = function (id, cid, nom, cat, rg) { return { id: id, couche_id: cid, nom: nom, categorie: cat, anneaux: [rg], bbox: [5.3, -4.1, 5.5, -3.8] }; };
    DATA.zones_territoriales = [z('z1', 'cp', 'Réserve A', 'interdit', A), z('z2', 'cz', 'ZAD B', 'sous_condition', B), z('z3', 'ci', 'Marais', 'sous_condition', C)];
    DATA.parcelles = [{ id: 'p1', ref: 'P-CRIT', statut: 'acquis', geo_polygon: P1 }, { id: 'p2', ref: 'P-MAJ', statut: 'acquis', geo_polygon: P2 }, { id: 'p3', ref: 'P-RIEN', statut: 'acquis', geo_polygon: P3 }, { id: 'p4', ref: 'P-SANS', statut: 'acquis' }];
    DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = [];
    /* rendre le volet visible pour que la carte ait une taille */
    var pane = document.getElementById('tab-foncier-territoire'), n = pane; while (n && n !== document.documentElement) { n.style.display = 'block'; n.style.visibility = 'visible'; n = n.parentElement; }
    pane.classList.add('active'); document.getElementById('page-foncier') && document.getElementById('page-foncier').classList.add('active');
  }, { st: stub.toString(), A: carre(5.348, -4.004, 5.353, -3.998), B: carre(5.356, -4.002, 5.360, -3.996), C: carre(5.340, -4.000, 5.343, -3.996), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.357, -4.001, 5.358, -3.999), P3: carre(5.345, -3.994, 5.346, -3.992) });
}
async function attendre(page) { await page.waitForFunction(() => window.FON_TER && FON_TER.pret === true, null, { timeout: 15000 }); await page.waitForFunction(() => FON_TER.map && FON_TER.map.loaded(), null, { timeout: 15000 }); }

test('données de la carte : zones, parcelles, hauteurs symboliques, niveaux (sans carte)', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, A, B, P1, P3 }) => {
    new Function('(' + st + ')()')();
    var src = { source: 'X', date_source: '2023-01-01' };
    DATA.couches_territoriales = [Object.assign({ id: 'cp', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'ci', nom: 'Inactive', type: 'zad', version: '1', statut: 'projet', actif: false }, src)];
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve', categorie: 'interdit', anneaux: [A, B], bbox: [5, -4, 6, -3] }, { id: 'z2', couche_id: 'ci', nom: 'Inactive', categorie: 'sous_condition', anneaux: [B], bbox: [5, -4, 6, -3] }, { id: 'z3', couche_id: 'absente', nom: 'Orpheline', categorie: 'info', anneaux: [A] }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', geo_polygon: P1 }, { id: 'p3', ref: 'P3' }, { id: 'p5', ref: 'P5', geo_polygon: P3 }]; FON_TER.alertes = { p1: { niveau: 'critique' } };
    var Z = fonTerritoireGeoZones(), G = fonTerritoireGeoParcelles(), o = {};
    o.zones = Z.features.map(function (f) { return f.properties.nom + ':' + f.properties.active + ':' + f.properties.hauteur + ':' + f.geometry.coordinates.length; });
    var ring = Z.features[0].geometry.coordinates[0][0]; o.ferme = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]; o.lngLat = ring[0][0] < 0 && ring[0][1] > 0;   /* [lng, lat] */
    o.parc = G.features.map(function (f) { return f.properties.ref + ':' + f.properties.niveau + ':' + f.properties.hauteur + ':' + f.properties.couleur; });
    o.bbox = fonTerBbox(G).map(function (x) { return Math.round(x * 1000) / 1000; });
    return o;
  }, { st: stub.toString(), A: carre(5.348, -4.004, 5.353, -3.998), B: carre(5.356, -4.002, 5.360, -3.996), P1: carre(5.349, -4.002, 5.351, -4.000), P3: carre(5.345, -3.994, 5.346, -3.992) });
  assert.deepEqual(r.zones, ['Réserve:1:60:2', 'Inactive:0:40:1']); assert.equal(r.ferme, true); assert.equal(r.lngLat, true);
  assert.deepEqual(r.parc, ['P1:critique:70:#ef4444', 'P5:inconnu:12:#64748b']); assert.equal(r.bbox[0], -4.002);
});

test('rendu 3D réel : couches, filtres, options, bâtiments et relief inactifs hors ligne', { skip: !dispo && 'maplibre-gl absent (npm i maplibre-gl@4.7.1)' }, async () => {
  const app = await ouvrirApp(); await preparer(app.page);
  await app.page.evaluate(() => { FON_TER.vue = null; fonTerritoireRender(); }); await attendre(app.page);
  const r = await app.page.evaluate(async () => {
    var m = FON_TER.map, o = {};
    o.couches = ['zones-fill', 'zones-line', 'zones-3d', 'parc-fill', 'parc-3d', 'parc-line'].map(function (l) { return !!m.getLayer(l); });
    o.donnees = [FON_TER.geoZones.features.length, FON_TER.geoParc.features.length];
    o.pitch = Math.round(m.getPitch()); o.visibleParDefaut = ['zones-3d', 'parc-3d'].map(function (l) { return m.getLayoutProperty(l, 'visibility'); });
    o.filtre = JSON.stringify(m.getFilter('zones-fill')); o.panneau = [/Forêts classées/.test(document.getElementById('fon-ter-panneau').innerHTML), /\(inactive/.test(document.getElementById('fon-ter-panneau').innerHTML)];
    o.barre = ['Vue d\'ensemble', '3D', 'Relief', 'Bâtiments', 'Volumes', 'Parcelles', 'Analyser les parcelles'].map(function (t) { return document.getElementById('fon-ter-barre').innerHTML.indexOf(t) !== -1; });
    fonTerritoireOption('volumes'); o.volumes = ['zones-3d', 'parc-3d'].map(function (l) { return m.getLayoutProperty(l, 'visibility'); });
    fonTerritoireVisibilite('cp', false); o.filtreMasque = JSON.stringify(m.getFilter('zones-fill'));
    fonTerritoireBasculer3D(); await new Promise(function (r) { setTimeout(r, 900); }); o.pitch2D = Math.round(m.getPitch()); fonTerritoireBasculer3D(); await new Promise(function (r) { setTimeout(r, 900); }); o.pitch3D = Math.round(m.getPitch());
    return o;
  });
  assert.deepEqual(r.couches, [true, true, true, true, true, true]); assert.deepEqual(r.donnees, [3, 3]); assert.equal(r.pitch, 55); assert.deepEqual(r.visibleParDefaut, ['none', 'none']);
  assert.match(r.filtre, /cp/); assert.match(r.filtre, /cz/); assert.doesNotMatch(r.filtre, /"ci"/); assert.deepEqual(r.panneau, [true, true]); assert.deepEqual(r.barre, [true, true, true, true, true, true, true]);
  assert.deepEqual(r.volumes, ['visible', 'visible']); assert.doesNotMatch(r.filtreMasque, /"cp"/); assert.equal(r.pitch2D, 0); assert.equal(r.pitch3D, 55);
});

test('contrôle d\'une parcelle et analyse : parcelles colorées par niveau, tableau des alertes, rien d\'enregistré', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await ouvrirApp(); await preparer(app.page);
  await app.page.evaluate(() => { FON_TER.vue = null; fonTerritoireRender(); }); await attendre(app.page);
  const r = await app.page.evaluate(async () => {
    var o = {}, avant = JSON.stringify(DATA.audits_fonciers || []);
    fonTerritoireControlerParcelle('p1'); o.focus = FON_TER.focus; o.panneau = /Contrôle de la parcelle/.test(document.getElementById('fon-ter-panneau').innerHTML) && /Réserve A/.test(document.getElementById('fon-ter-panneau').innerHTML);
    o.niveauP1 = FON_TER.alertes.p1.niveau; o.focusSurCarte = FON_TER.geoParc.features.filter(function (f) { return f.properties.focus === 1; }).map(function (f) { return f.properties.ref; });
    await fonTerritoireAnalyser();
    o.niveaux = FON_TER.geoParc.features.map(function (f) { return f.properties.ref + ':' + f.properties.niveau; });
    o.table = /Parcelles en alerte/.test(document.getElementById('fon-ter-panneau').innerHTML) && /non enregistrée/.test(document.getElementById('fon-ter-panneau').innerHTML);
    o.rien = JSON.stringify(DATA.audits_fonciers || []) === avant;
    fonTerritoireVoirParcelle(''); o.efface = FON_TER.focus === '' && FON_TER.resultat === null;
    return o;
  });
  assert.equal(r.focus, 'p1'); assert.equal(r.panneau, true); assert.equal(r.niveauP1, 'critique'); assert.deepEqual(r.focusSurCarte, ['P-CRIT']);
  assert.deepEqual(r.niveaux, ['P-CRIT:critique', 'P-MAJ:majeur', 'P-RIEN:aucun']); assert.equal(r.table, true); assert.equal(r.rien, true); assert.equal(r.efface, true);
});

test('capture : carte 3D sombre avec volumes (inspection visuelle)', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await ouvrirApp(); await app.page.setViewportSize({ width: 1500, height: 900 }); await preparer(app.page);
  await app.page.evaluate(async () => { FON_TER.vue = null; fonTerritoireRender(); }); await attendre(app.page);
  await app.page.evaluate(async () => { var l = document.getElementById('login-screen'); if (l) l.style.display = 'none'; fonTerritoireOption('volumes'); await fonTerritoireAnalyser(); fonTerritoireEnsemble(); await new Promise(function (r) { setTimeout(r, 1500); }); });
  await app.page.evaluate(() => document.getElementById('fon-ter-carte-zone').scrollIntoView());
  const el = await app.page.$('#fon-ter-carte-zone'); const sortie = process.env.CARTE_CAPTURE; if (sortie) await el.screenshot({ path: sortie });
  const px = await app.page.evaluate(() => { var c = document.querySelector('#fon-ter-map canvas'); return [c.width, c.height]; });
  assert.ok(px[0] > 300 && px[1] > 300, 'canvas de la carte trop petit : ' + px);
});


/* ── Courbes de niveau, plein écran, performances ── */
const zlib = require('zlib');
const MLCONTOUR = process.env.MLCONTOUR_DIST || path.join(__dirname, '..', 'node_modules', 'maplibre-contour', 'dist');
const dispoContour = dispo && fs.existsSync(path.join(MLCONTOUR, 'index.min.js'));
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
/* Tuile de relief Terrarium synthétique : pente de 0 à 100 m d'ouest en est. */
function tuileRelief() {
  const W = 256, raw = Buffer.alloc((W * 4 + 1) * W);
  for (let y = 0; y < W; y++) { raw[y * (W * 4 + 1)] = 0; for (let x = 0; x < W; x++) { const v = 32768 + (x / (W - 1)) * 100, o = y * (W * 4 + 1) + 1 + x * 4; raw[o] = Math.floor(v / 256); raw[o + 1] = Math.floor(v % 256); raw[o + 2] = Math.floor((v - Math.floor(v)) * 256); raw[o + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('courbes de niveau : bibliothèque chargée à la demande, source et couches ajoutées, tracés produits à partir du relief', { skip: !dispoContour && 'maplibre-contour absent (npm i --no-save maplibre-contour@0.1.0)' }, async () => {
  const app = await ouvrirApp(); await preparer(app.page);
  const png = tuileRelief(); let nbRelief = 0;
  await app.page.context().route('**/elevation-tiles-prod/**', (route) => { nbRelief++; route.fulfill({ status: 200, contentType: 'image/png', body: png }); });
  await app.page.evaluate(() => { FON_TER.vue = null; FON_TER.courbes = false; fonTerritoireRender(); }); await attendre(app.page);
  const avant = await app.page.evaluate(() => ({ source: !!FON_TER.map.getSource('courbes'), lib: !!window.mlcontour, bouton: /Courbes/.test(document.getElementById('fon-ter-barre').innerHTML) }));
  assert.deepEqual(avant, { source: false, lib: false, bouton: true });   /* rien chargé tant que les courbes ne sont pas demandées */
  await app.page.addScriptTag({ path: path.join(MLCONTOUR, 'index.min.js') });
  await app.page.evaluate(() => { FON_TER.map.jumpTo({ center: [-4.0, 5.35], zoom: 13, pitch: 0 }); fonTerritoireOption('courbes'); });
  await app.page.waitForFunction(() => FON_TER.map.getSource('courbes') && FON_TER.map.getLayer('courbes-ligne'), null, { timeout: 15000 });
  await app.page.waitForFunction(() => FON_TER.map.querySourceFeatures('courbes', { sourceLayer: 'contours' }).length > 0, null, { timeout: 20000 });
  const r = await app.page.evaluate(() => {
    var m = FON_TER.map, f = m.querySourceFeatures('courbes', { sourceLayer: 'contours' }), o = {};
    o.nb = f.length; o.cle = f.every(function (x) { return typeof x.properties.ele === 'number' && x.properties.level !== undefined; });
    o.altitudes = Array.from(new Set(f.map(function (x) { return x.properties.ele; }))).sort(function (a, b) { return a - b; }).slice(0, 8);
    o.visible = m.getLayoutProperty('courbes-ligne', 'visibility'); o.avantZones = m.getStyle().layers.map(function (l) { return l.id; }).indexOf('courbes-ligne') < m.getStyle().layers.map(function (l) { return l.id; }).indexOf('zones-fill');
    fonTerritoireOption('courbes'); o.masque = m.getLayoutProperty('courbes-ligne', 'visibility'); return o;
  });
  assert.ok(r.nb > 0, 'aucun tracé'); assert.equal(r.cle, true); assert.ok(r.altitudes.length >= 2, 'altitudes : ' + r.altitudes); assert.equal(r.visible, 'visible'); assert.equal(r.avantZones, true); assert.equal(r.masque, 'none'); assert.ok(nbRelief > 0);
});

test('plein écran, panneau et mode léger', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await ouvrirApp(); await app.page.setViewportSize({ width: 1280, height: 800 }); await preparer(app.page);
  await app.page.evaluate(() => { FON_TER.vue = null; fonTerritoireRender(); }); await attendre(app.page);
  const r = await app.page.evaluate(async () => {
    var o = {}, att = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }, c = document.getElementById('fon-ter-cadre');
    o.barre = ['Plein écran', 'Panneau', 'Léger', 'Courbes'].map(function (t) { return document.getElementById('fon-ter-barre').innerHTML.indexOf(t) !== -1; });
    fonTerritoirePleinEcran(true); await att(400);
    var rc = c.getBoundingClientRect(), cv = document.querySelector('#fon-ter-map canvas').getBoundingClientRect();
    o.plein = c.classList.contains('fon-ter-plein') && FON_TER.plein; o.cadre = [Math.round(rc.width) === window.innerWidth, Math.round(rc.height) === window.innerHeight]; o.canvasGrand = cv.height > 500 && cv.width > 600;
    o.libelle = /Quitter le plein écran/.test(document.getElementById('fon-ter-barre').innerHTML);
    var l0 = cv.width; fonTerritoirePanneau(); await att(300); var l1 = document.querySelector('#fon-ter-map canvas').getBoundingClientRect().width;
    o.panneauMasque = document.getElementById('fon-ter-panneau').style.display === 'none' && l1 > l0; fonTerritoirePanneau();
    fonTerritoirePleinEcran(false); await att(300); o.sorti = !c.classList.contains('fon-ter-plein') && !document.body.classList.contains('fon-ter-plein-body') && FON_TER.plein === false;
    FON_TER.leger = false; FON_TER.relief = FON_TER.batiments = true; fonTerritoireLeger(); o.leger = FON_TER.leger === true && !FON_TER.relief && !FON_TER.batiments && !FON_TER.volumes && !FON_TER.courbes && !FON_TER.pitch;
    return o;
  });
  assert.deepEqual(r.barre, [true, true, true, true]); assert.equal(r.plein, true); assert.deepEqual(r.cadre, [true, true]); assert.equal(r.canvasGrand, true); assert.equal(r.libelle, true);
  assert.equal(r.panneauMasque, true); assert.equal(r.sorti, true); assert.equal(r.leger, true);
});

test('performances : contours des zones renvoyés à la carte seulement s\'ils changent ; calcul des zones actives sans recalcul par zone', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await ouvrirApp(); await preparer(app.page);
  await app.page.evaluate(() => { FON_TER.vue = null; fonTerritoireRender(); }); await attendre(app.page);
  const r = await app.page.evaluate(async () => {
    var m = FON_TER.map, o = {}, n = { zones: 0, parc: 0 }, sz = m.getSource('zones'), sp = m.getSource('parcelles'), oz = sz.setData.bind(sz), op = sp.setData.bind(sp);
    sz.setData = function (d) { n.zones++; return oz(d); }; sp.setData = function (d) { n.parc++; return op(d); };
    fonTerritoireDonnees(); fonTerritoireDonnees(); fonTerritoireCarteMaj(); o.inchange = [n.zones, n.parc];
    DATA.zones_territoriales.push({ id: 'zNouv', couche_id: 'cp', nom: 'Nouvelle', categorie: 'interdit', anneaux: [[[5.36, -3.99], [5.36, -3.98], [5.37, -3.98]]], bbox: [5.3, -4.1, 5.5, -3.8] });
    fonTerritoireDonnees(); o.apresAjout = [n.zones, n.parc, FON_TER.geoZones.features.length];
    /* 1 500 zones de 400 points : construction des données */
    var grand = []; for (var i = 0; i < 1500; i++) { var rg = []; for (var k = 0; k < 400; k++) rg.push([5 + i * 1e-4 + Math.cos(k / 64) * 1e-4, -4 + Math.sin(k / 64) * 1e-4]); grand.push({ id: 'g' + i, couche_id: i % 2 ? 'cp' : 'cz', nom: 'G' + i, categorie: 'interdit', anneaux: [rg], bbox: [5, -4, 6, -3] }); }
    DATA.zones_territoriales = grand; var t0 = performance.now(); var g = fonTerritoireGeoZones(); o.ms = performance.now() - t0; o.nb = g.features.length;
    return o;
  });
  assert.deepEqual(r.inchange, [0, 0]); assert.deepEqual(r.apresAjout.slice(0, 2), [1, 0]); assert.equal(r.apresAjout[2], 4); assert.equal(r.nb, 1500); assert.ok(r.ms < 400, 'construction trop lente : ' + r.ms + ' ms');
});
