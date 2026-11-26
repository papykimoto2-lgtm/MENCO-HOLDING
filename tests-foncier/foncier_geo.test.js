/* Foncier L2 — géométrie : chevauchement, lecture GeoJSON/KML. Extrait le code RÉEL de menko-immo.html. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'menko-immo.html'), 'utf8');
function extraire(nom) {
  const i = html.search(new RegExp('function ' + nom + '\\s*\\('));
  assert.ok(i >= 0, 'introuvable : ' + nom);
  let n = 0, k = html.indexOf('{', i);
  for (; k < html.length; k++) { if (html[k] === '{') n++; else if (html[k] === '}' && --n === 0) break; }
  return html.slice(i, k + 1);
}
const ctx = { Math, JSON, Number, isFinite, String, Infinity, DATA: { parcelles: [] }, toast() {}, fonRegimeParcelle: (p) => p.regime || 'urbain' };
vm.createContext(ctx);
vm.runInContext('var FON_GEO_TOL_M = 0.5;', ctx);
['latLngToUtm', 'utm30ToLatLng', '_sigParcellesActives', '_sigParcellePath', 'fonGeoMetres', 'fonGeoBbox', 'fonGeoDansPoly', 'fonGeoDistBord',
  'fonGeoChevauchement', 'fonGeoChevauchements', 'fonGeoParse'].forEach((n) => vm.runInContext(extraire(n), ctx));

const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];

test('carrés qui se recouvrent : aire proche du recouvrement réel', () => {
  const a = ctx.fonGeoChevauchement(carre(0, 0, 100), carre(50, 50, 100));
  assert.ok(a > 2000 && a < 2600, 'aire ≈ 2500, obtenu ' + a);
});
test('parcelles contiguës (bord commun) : aucun chevauchement', () => {
  assert.equal(ctx.fonGeoChevauchement(carre(0, 0, 100), carre(100, 0, 100)), 0);
});
test('bruit de levé de 0,3 m : toléré', () => {
  assert.equal(ctx.fonGeoChevauchement(carre(0, 0, 100), carre(99.7, 0, 100)), 0);
});
test('recouvrement de 5 m : détecté', () => {
  assert.ok(ctx.fonGeoChevauchement(carre(0, 0, 100), carre(95, 0, 100)) > 0);
});
test('parcelle entièrement contenue : détectée', () => {
  assert.ok(ctx.fonGeoChevauchement(carre(0, 0, 100), carre(20, 20, 30)) > 0);
});
test('parcelles disjointes : aucun chevauchement', () => {
  assert.equal(ctx.fonGeoChevauchement(carre(0, 0, 100), carre(500, 500, 100)), 0);
});
test('polygone non convexe (L) : la partie creuse n\'est pas comptée', () => {
  const L = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]];
  assert.equal(ctx.fonGeoChevauchement(L, carre(60, 60, 30)), 0);
});

function bornes(x, y, c) { return carre(x, y, c).map((q, i) => ({ nom: 'B' + i, x: q[0], y: q[1] })); }
test('fonGeoChevauchements : ignore la parcelle elle-même et les parcelles découpées', () => {
  const E = 400000, N = 600000;
  ctx.DATA.parcelles = [
    { id: 'p1', ref: 'P1', utm_zone: 30, bornes: bornes(E, N, 100) },
    { id: 'p2', ref: 'P2', utm_zone: 30, bornes: bornes(E + 50, N + 50, 100), regime: 'rural' },
    { id: 'p3', ref: 'P3', utm_zone: 30, bornes: bornes(E, N, 100), decoupee_dans: 'x' },
    { id: 'p4', ref: 'P4', utm_zone: 30, bornes: bornes(E + 500, N, 100) },
  ];
  const r = ctx.fonGeoChevauchements(ctx.DATA.parcelles[0]);
  assert.deepEqual(Array.from(r.map((x) => x.id)), ['p2']);
  assert.equal(r[0].regime, 'rural');
  assert.ok(r[0].aire > 1800 && r[0].aire < 2600, 'aire ' + r[0].aire);
});

test('GeoJSON Polygon : (lng,lat) lu en [lat,lng], anneau fermé retiré', () => {
  const g = JSON.stringify({ type: 'Polygon', coordinates: [[[-5, 6], [-5, 6.001], [-4.999, 6.001], [-5, 6]]] });
  const r = ctx.fonGeoParse(g, 'x.geojson');
  assert.equal(r.pts.length, 3); assert.deepEqual(Array.from(r.pts[0]), [6, -5]);
});
test('GeoJSON FeatureCollection / MultiPolygon', () => {
  const g = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[-5, 6], [-5, 6.1], [-4.9, 6.1], [-5, 6]]]] } }] });
  assert.equal(ctx.fonGeoParse(g, 'a.json').pts.length, 3);
});
test('KML : lng,lat,alt', () => {
  const k = '<?xml version="1.0"?><kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>-5,6,0 -5,6.1,0 -4.9,6.1,0 -5,6,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>';
  const r = ctx.fonGeoParse(k, 'a.kml'); assert.equal(r.pts.length, 3); assert.deepEqual(Array.from(r.pts[1]), [6.1, -5]);
});
test('fichiers invalides : erreur explicite, jamais d\'exception', () => {
  assert.ok(ctx.fonGeoParse('pas du json', 'a.geojson').erreur);
  assert.ok(ctx.fonGeoParse(JSON.stringify({ type: 'Point', coordinates: [0, 0] }), 'a.geojson').erreur);
  assert.ok(ctx.fonGeoParse('<kml></kml>', 'a.kml').erreur);
  assert.ok(ctx.fonGeoParse(JSON.stringify({ type: 'Polygon', coordinates: [[[-5, 6], [-5, 6.1]]] }), 'a.geojson').erreur);
  assert.ok(ctx.fonGeoParse(JSON.stringify({ type: 'Polygon', coordinates: [[[200, 6], [-5, 6.1], [-4, 6.1]]] }), 'a.geojson').erreur);
});
