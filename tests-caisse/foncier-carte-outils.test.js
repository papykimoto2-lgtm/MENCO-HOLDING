/* Carte du Territoire — outils : mesure de distance et de surface, échelle, export PNG avec légende. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const MAPLIBRE = process.env.MAPLIBRE_DIST || path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dispo = fs.existsSync(path.join(MAPLIBRE, 'maplibre-gl.js'));
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {};
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); };
};

test('mesures : distance géodésique, surface, formats ; état de la mesure, exclusivité avec le dessin, Échap', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {};
    o.d1 = fonTerritoireDistanceM([[5.35, -4.0], [5.36, -4.0]]); o.d2 = fonTerritoireDistanceM([[5.35, -4.0], [5.35, -3.99]]); o.d3 = fonTerritoireDistanceM([[5.35, -4.0]]);
    var rect = [[-4.006, 5.345], [-3.996, 5.345], [-3.996, 5.356], [-4.006, 5.356]]; var m = fonTerritoireMesureCalcul(rect, 'surface'); o.aire = m.aire_m2; o.per = m.perimetre_m; o.sansSurface = fonTerritoireMesureCalcul(rect, 'distance').aire_m2; o.deux = fonTerritoireMesureCalcul(rect.slice(0, 2), 'surface').aire_m2;
    o.fmt = [fonTerritoireFormatLongueur(999.04), fonTerritoireFormatLongueur(1500), fonTerritoireFormatSurface(1347587), fonTerritoireFormatSurface(2500000)];
    fonTerritoireMesureDemarrer('distance'); fonTerritoireMesureAjouter(-4.0, 5.35); fonTerritoireMesureAjouter(-3.99, 5.35); o.pts = FON_TER.mesure.pts.length; fonTerritoireMesureMode('surface'); o.mode = FON_TER.mesure.mode; fonTerritoireMesureRetirer(); o.retire = FON_TER.mesure.pts.length;
    fonTerritoireDessinDemarrer(); o.excl1 = [FON_TER.mesure === null, !!FON_TER.dessin]; fonTerritoireMesureDemarrer('surface'); o.excl2 = [!!FON_TER.mesure, FON_TER.dessin === null];
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); o.echap = FON_TER.mesure === null; o.barre = [fonTerritoireBarreHtml().indexOf('Mesurer') !== -1, fonTerritoireBarreHtml().indexOf('Exporter') !== -1];
    fonTerritoireMesureDemarrer('distance'); o.barreMesure = ['Distance', 'Surface', 'Fin'].map(function (t) { return fonTerritoireBarreHtml().indexOf(t) !== -1; }); fonTerritoireMesureFin(); return o;
  }, { st: stub.toString() });
  assert.ok(Math.abs(r.d1 - 1111.9) < 3, 'd1 ' + r.d1); assert.ok(Math.abs(r.d2 - 1107.1) < 3, 'd2 ' + r.d2); assert.equal(r.d3, 0);
  assert.ok(r.aire > 1.33e6 && r.aire < 1.37e6, 'aire ' + r.aire); assert.ok(r.per > 4600 && r.per < 4720, 'périmètre ' + r.per); assert.equal(r.sansSurface, 0); assert.equal(r.deux, 0);
  assert.equal(r.fmt[0], '999 m'); assert.match(r.fmt[1], /^1[,.]5 km$/); assert.match(r.fmt[2], /ha/); assert.match(r.fmt[3], /km²/);
  assert.equal(r.pts, 2); assert.equal(r.mode, 'surface'); assert.equal(r.retire, 1); assert.deepEqual(r.excl1, [true, true]); assert.deepEqual(r.excl2, [true, true]); assert.equal(r.echap, true); assert.deepEqual(r.barre, [true, true]); assert.deepEqual(r.barreMesure, [true, true, true]);
});

async function carte() {
  const app = await ouvrirApp(); await app.page.setViewportSize({ width: 1300, height: 800 });
  await app.page.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') }); await app.page.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); window.__FON_TER_STYLE_HORS_LIGNE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }] };
    DATA.couches_territoriales = [{ id: 'cp', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', version: '3', statut: 'officiel', source: 'Décret n° 12', date_source: '2023-01-01', actif: true }];
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve A', categorie: 'interdit', anneaux: [[[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]], bbox: [5.348, -4.004, 5.353, -3.998] }];
    DATA.parcelles = []; DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; DATA.secteurs_veille = [];
    var l = document.getElementById('login-screen'); if (l) l.style.display = 'none';
    var pane = document.getElementById('tab-foncier-territoire'), n = pane; while (n && n !== document.documentElement) { n.style.display = 'block'; n.style.visibility = 'visible'; n = n.parentElement; }
    pane.classList.add('active'); FON_TER.vue = null; fonTerritoireRender();
  }, { st: stub.toString() });
  await app.page.waitForFunction(() => window.FON_TER && FON_TER.pret === true, null, { timeout: 15000 }); return app;
}

test('carte : mesure au clic (distance puis surface), calques et fenêtre de résultat, aucune fenêtre de zone ouverte pendant la mesure', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await carte();
  const r = await app.page.evaluate(async () => {
    var m = FON_TER.map, o = {}; await new Promise(function (r) { setTimeout(r, 300); });
    o.couches = ['mesure-fill', 'mesure-line', 'mesure-pts'].map(function (l) { return !!m.getLayer(l); });
    fonTerritoireMesureDemarrer('distance'); var clic = function (lng, lat) { m.fire('click', { lngLat: { lng: lng, lat: lat }, point: { x: 10, y: 10 }, originalEvent: {} }); };
    clic(-4.0, 5.35); clic(-3.99, 5.35); o.txtD = document.getElementById('fon-ter-mesure').textContent; o.vis = document.getElementById('fon-ter-mesure').style.display;
    fonTerritoireMesureMode('surface'); clic(-3.99, 5.36); o.txtS = document.getElementById('fon-ter-mesure').textContent;
    o.popup = document.querySelectorAll('.maplibregl-popup').length; o.donnees = m.getSource('mesure') && true;
    fonTerritoireMesureFin(); o.fin = document.getElementById('fon-ter-mesure').style.display; o.echelle = !!document.querySelector('.maplibregl-ctrl-scale'); return o;
  });
  assert.deepEqual(r.couches, [true, true, true]); assert.equal(r.vis, 'block'); assert.match(r.txtD, /Distance : 1[,.]1\d km/); assert.match(r.txtS, /Surface : .*ha/); assert.match(r.txtS, /3 pt/); assert.equal(r.popup, 0); assert.equal(r.fin, 'none'); assert.equal(r.echelle, true);
});

test('export PNG : image valide plus grande que la carte, cartouche, légende, couches et mentions ; téléchargement nommé ; journalisé', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await carte();
  const r = await app.page.evaluate(async () => {
    var o = {}, tel = []; var orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { tel.push([this.download, this.href]); };
    var cv = FON_TER.map.getCanvas(); o.carte = [cv.width, cv.height]; window.__T = []; window.__LOG = [];
    var res = await fonTerritoireExporterCarte(); HTMLAnchorElement.prototype.click = orig; o.res = res; o.tel = tel.length && tel[0][0];
    if (tel.length) { var buf = new Uint8Array(await (await fetch(tel[0][1])).arrayBuffer()); o.signature = Array.from(buf.slice(0, 8)).join(','); o.octets = buf.length;
      var bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' })); o.dim = [bmp.width, bmp.height];
      /* le cartouche (bandeau bleu en haut) et le pied (texte sombre sur blanc) sont bien dessinés */
      var c2 = document.createElement('canvas'); c2.width = bmp.width; c2.height = bmp.height; var g = c2.getContext('2d'); g.drawImage(bmp, 0, 0); var px = g.getImageData(5, 5, 1, 1).data; o.bandeau = [px[0], px[1], px[2]]; var py = g.getImageData(bmp.width - 5, bmp.height - 5, 1, 1).data; o.pied = [py[0], py[1], py[2]];
    }
    o.toast = window.__T.join(' '); o.log = window.__LOG.join('|'); return o;
  });
  assert.match(r.tel, /^carte-territoire-\d{4}-\d{2}-\d{2}\.png$/); assert.equal(r.signature, '137,80,78,71,13,10,26,10'); assert.ok(r.octets > 3000, 'PNG trop petit : ' + r.octets);
  assert.equal(r.dim[0], r.res.largeur); assert.equal(r.dim[1], r.res.hauteur); assert.ok(r.dim[0] >= r.carte[0] && r.dim[1] > r.carte[1] + 100, 'dimensions ' + r.dim + ' carte ' + r.carte);
  assert.deepEqual(r.bandeau, [11, 61, 107]); assert.deepEqual(r.pied, [255, 255, 255]); assert.match(r.toast, /exportée/); assert.match(r.log, /FONCIER_TERRITOIRE_EXPORT_CARTE PNG \d+x\d+ · 1 couche\(s\)/);
});
