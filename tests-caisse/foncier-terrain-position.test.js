/* Foncier — écran Terrain : « Où suis-je ? » (position GPS contre les couches actives, hors ligne) et badge territorial de la parcelle. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.syncToSupabase = function () {};
};
const PREP = () => {
  var src = { source: 'Décret', date_source: '2023-01-01' };
  DATA.couches_territoriales = [Object.assign({ id: 'cp', reference: 'COU-1', nom: 'Forêts <i>classées</i>', type: 'protegee', version: '3', statut: 'officiel' }, src)];
  DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve A', categorie: 'interdit', anneaux: [[[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]], bbox: [5.348, -4.004, 5.353, -3.998] }];
};
test('point : dedans, proche (< 500 m), loin, sans couche active, texte échappé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st, pr }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    var d = fonTerritoirePointControle(5.350, -4.001); o.dedans = [d.dedans.length, d.proches.length, d.dedans[0] && d.dedans[0].categorie];
    var p = fonTerritoirePointControle(5.3555, -4.001); o.proche = [p.dedans.length, p.proches.length, p.proches[0] && p.proches[0].distance_m];
    var l = fonTerritoirePointControle(5.40, -4.001); o.loin = [l.dedans.length, l.proches.length];
    o.html = fonTerritoirePointHtml(Object.assign({ acc: 7 }, d));
    DATA.couches_territoriales[0].actif = false; var s = fonTerritoirePointControle(5.350, -4.001); o.sans = [s.couches.length, s.dedans.length, /ne vaut pas conformité/.test(fonTerritoirePointHtml(s))];
    return o;
  }, { st: stub.toString(), pr: PREP.toString() });
  assert.deepEqual(r.dedans, [1, 0, 'interdit']); assert.equal(r.proche[0], 0); assert.equal(r.proche[1], 1); assert.ok(r.proche[2] > 200 && r.proche[2] < 350);
  assert.deepEqual(r.loin, [0, 0]); assert.ok(!/<i>/.test(r.html) && /&lt;i&gt;/.test(r.html) && /absence de croisement/.test(r.html));
  assert.deepEqual(r.sans, [0, 0, true]);
});
test('écran Terrain : bouton, résultat GPS affiché, GPS refusé = message sans plantage, badge parcelle', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    DATA.parcelles = [{ id: 'p1', ref: 'P1', geo_polygon: [[5.349, -4.002], [5.349, -4.000], [5.351, -4.000], [5.351, -4.002]] }]; FON_RURAL.terrainParcelle = 'p1';
    document.body.insertAdjacentHTML('beforeend', '<div id="fon-rural-onglets"></div><div id="fon-rural-liste"></div>');
    fonTerrainRender(); o.btn = /Où suis-je/.test(document.getElementById('fon-rural-liste').innerHTML); o.badge = /Territoire de la parcelle/.test(document.getElementById('fon-rural-liste').innerHTML);
    window.fonGpsPosition = async function () { return { lat: 5.350, lng: -4.001, acc: 6 }; };
    await fonTerrainOuSuisJe(); o.res = /Réserve A/.test(document.getElementById('fon-terrain-point').innerHTML);
    fonTerrainRender(); o.persiste = /Réserve A/.test(document.getElementById('fon-terrain-point').innerHTML);
    window.fonGpsPosition = async function () { throw new Error('Autorisation GPS refusée'); }; o.refus = await fonTerrainOuSuisJe(); o.msg = (window.__T || []).slice(-1)[0];
    return o;
  }, { st: stub.toString(), pr: PREP.toString() });
  assert.ok(r.btn && r.badge && r.res && r.persiste); assert.equal(r.refus, false); assert.match(r.msg, /refusée/);
});
