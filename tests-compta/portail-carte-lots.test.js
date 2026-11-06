/* Portail — page Carte : calque des contours de lots.
   Charge la VRAIE page du portail ; Leaflet est servi depuis tests-compta/fixtures (copie de la version 1.9.4 que le portail
   charge sur cdnjs), Supabase est simulé (vue publique pi_lots_public), les tuiles sont coupées.
   Vérifie : contours dessinés pour les lots tracés, bascule épingles ↔ contours au zoom, astuce de zoom, case de désactivation,
   lot tracé sans point placé au centre de son contour, compteurs. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

function chargerPlaywright() {
  try { return require('playwright'); } catch (e) { /* repli */ }
  return require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
}
function trouverChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    const d = fs.readdirSync(base).filter((x) => x.indexOf('chromium-') === 0).sort().reverse();
    for (const x of d) { const c = path.join(base, x, 'chrome-linux', 'chrome'); if (fs.existsSync(c)) return c; }
  }
  return undefined;
}

/* 40 lots tracés (~15 × 20 m) près d'Abidjan : 1 sur 4 vendu, 1 sur 5 réservé ; le lot 3 n'a pas de point saisi ;
   plus 2 lots sans contour (épingle seule). */
function lotsSimules() {
  const lots = [], lat0 = 5.3153, lng0 = -4.0317, dLat = 20 / 110540, dLng = 15 / (111320 * Math.cos(lat0 * Math.PI / 180));
  for (let i = 0; i < 40; i++) {
    const r = Math.floor(i / 8), c = i % 8, la = lat0 + r * dLat * 1.1, lo = lng0 + c * dLng * 1.1;
    lots.push({ id: 'L' + i, numero: String(i + 1), ilot: 'B', statut: i % 4 === 0 ? 'vendu' : (i % 5 === 0 ? 'reserve' : 'disponible'),
      prix: 6600000, superficie: 300, lat: i === 3 ? null : la + dLat / 2, lng: i === 3 ? null : lo + dLng / 2,
      geo_polygon: [[la, lo], [la, lo + dLng], [la + dLat, lo + dLng], [la + dLat, lo]] });
  }
  lots.push({ id: 'X1', numero: '900', statut: 'disponible', lat: 5.33, lng: -4.02, geo_polygon: null });
  lots.push({ id: 'X2', numero: '901', statut: 'disponible', lat: 5.331, lng: -4.021, geo_polygon: [[1, 2]] });
  return lots;
}

let nav;
async function ouvrirCarte() {
  if (!nav) nav = await chargerPlaywright().chromium.launch({ executablePath: trouverChromium() });
  const page = await nav.newPage({ viewport: { width: 1200, height: 1000 } });
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:')) return route.continue();
    if (/leaflet\.min\.js/.test(u)) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(FIX, 'leaflet-1.9.4.js')) });
    if (/leaflet\.min\.css/.test(u)) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(FIX, 'leaflet-1.9.4.css')) });
    if (/\/rest\/v1\/pi_lots_public/.test(u)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(lotsSimules()) });
    if (/\/rest\/v1\//.test(u)) return route.fulfill({ contentType: 'application/json', body: '[]' });
    return route.abort();
  });
  await page.goto('file://' + path.join(RACINE, 'portail-unique.html'));
  await page.evaluate(() => basculerVersOnglet('carte'));
  await page.waitForFunction(() => window.L && typeof CARTE !== 'undefined' && CARTE.map && CARTE.contours, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { page, erreurs };
}
test.after(async () => { if (nav) await nav.close(); });

test('contours dessinés pour chaque lot tracé, compteur à jour, lot sans point placé au centre de son contour', async () => {
  const { page, erreurs } = await ouvrirCarte();
  const r = await page.evaluate(() => ({
    contours: CARTE.contours.getLayers().length,
    epinglesLots: CARTE.marqLots.getLayers().length,
    cnt: document.getElementById('cnt-contours').textContent,
    lot4: (_mapPointsLots().find((p) => p.nom.indexOf('Lot 4 ') === 0) || {}),
    sansContour: _mapPointsLots().filter((p) => !p.contour).map((p) => p.numero).sort()
  }));
  assert.strictEqual(r.contours, 40);
  assert.strictEqual(r.epinglesLots, 40);
  assert.strictEqual(r.cnt, '40');
  assert.ok(Math.abs(r.lot4.lat - 5.3154) < 0.001 && Math.abs(r.lot4.lng - (-4.0313)) < 0.001, 'lot 4 placé au centre de son contour');
  assert.deepStrictEqual(r.sansContour, ['900', '901']);
  assert.deepStrictEqual(erreurs, []);
  await page.close();
});

test('zoom rapproché : contours visibles, épingles des lots tracés masquées ; vue éloignée : l\'inverse, avec l\'astuce', async () => {
  const { page, erreurs } = await ouvrirCarte();
  await page.evaluate(() => CARTE.map.setView([5.3156, -4.0310], 18, { animate: false }));
  await page.waitForTimeout(200);
  let r = await page.evaluate(() => ({ c: CARTE.map.hasLayer(CARTE.contours), m: CARTE.map.hasLayer(CARTE.marqLots), astuce: document.getElementById('carte-astuce-lots').hidden }));
  assert.deepStrictEqual(r, { c: true, m: false, astuce: true });
  await page.evaluate(() => CARTE.map.setView([5.3156, -4.0310], 12, { animate: false }));
  await page.waitForTimeout(200);
  r = await page.evaluate(() => ({ c: CARTE.map.hasLayer(CARTE.contours), m: CARTE.map.hasLayer(CARTE.marqLots), astuce: document.getElementById('carte-astuce-lots').hidden }));
  assert.deepStrictEqual(r, { c: false, m: true, astuce: false });
  assert.deepStrictEqual(erreurs, []);
  await page.close();
});

test('couleur du contour selon le statut (disponible / réservé / vendu)', async () => {
  const { page } = await ouvrirCarte();
  const cols = await page.evaluate(() => {
    const out = {}; CARTE.contours.eachLayer((l) => { out[l.options.fillColor] = (out[l.options.fillColor] || 0) + 1; }); return out;
  });
  /* i % 4 === 0 → vendu (10) ; sinon i % 5 === 0 → réservé (i = 5, 10, 15, 25, 30, 35 → 6) ; reste disponible (24) */
  assert.deepStrictEqual(cols, { '#94a3b8': 10, '#f59e0b': 6, '#16a34a': 24 });
  await page.close();
});

test('case « Contours des lots » décochée : plus de contours, toutes les épingles reviennent sur la carte', async () => {
  const { page, erreurs } = await ouvrirCarte();
  await page.evaluate(() => { document.getElementById('mapf-contours').checked = false; majCarte(); });
  const r = await page.evaluate(() => ({ contours: CARTE.contours.getLayers().length, cnt: document.getElementById('cnt-contours').textContent,
    epingles: CARTE.couche.getLayers().filter((l) => l instanceof L.Marker).length, astuce: document.getElementById('carte-astuce-lots').hidden }));
  assert.strictEqual(r.contours, 0); assert.strictEqual(r.cnt, '0'); assert.strictEqual(r.astuce, true);
  assert.ok(r.epingles >= 42, 'les 42 lots ont leur épingle (' + r.epingles + ')');
  assert.deepStrictEqual(erreurs, []);
  await page.close();
});

test('« Disponibles uniquement » s\'applique aussi aux contours', async () => {
  const { page } = await ouvrirCarte();
  await page.evaluate(() => { document.getElementById('mapf-dispo').checked = true; majCarte(); });
  const n = await page.evaluate(() => CARTE.contours.getLayers().length);
  assert.strictEqual(n, 24);
  await page.close();
});
