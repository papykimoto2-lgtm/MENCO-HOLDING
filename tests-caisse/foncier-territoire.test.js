/* Foncier L18 — référentiel territorial (brique 1) et contrôle territorial de l'audit (brique 2). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.dbDelete = async function () { return true; }; window.deleteFromSupabase = function () {};
  window.syncToSupabase = function () {}; window.logAction = function () {}; window.confirm = function () { return true; }; window.prompt = function () { return 'dérogation motivée pour le test'; };
};
/* parcelle carrée de 0,001° (≈ 110 m) autour de 5,350 ; -4,000 */
const PARC = [[5.350, -4.000], [5.350, -3.999], [5.351, -3.999], [5.351, -4.000]];
const carre = (lat0, lng0, lat1, lng1) => ({ type: 'Polygon', coordinates: [[[lng0, lat0], [lng1, lat0], [lng1, lat1], [lng0, lat1], [lng0, lat0]]] });

test('lecture GeoJSON : polygones et multipolygones, ignorés signalés, UTM refusé, simplification', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    var gj = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { nom: 'Forêt A', categorie: 'interdit' }, geometry: { type: 'Polygon', coordinates: [[[-4.0, 5.35], [-3.99, 5.35], [-3.99, 5.36], [-4.0, 5.36], [-4.0, 5.35]]] } },
      { type: 'Feature', properties: { NAME: 'Multi' }, geometry: { type: 'MultiPolygon', coordinates: [[[[-4.0, 5.3], [-3.99, 5.3], [-3.99, 5.31], [-4.0, 5.3]]], [[[-3.9, 5.3], [-3.89, 5.3], [-3.89, 5.31], [-3.9, 5.3]]]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-4.0, 5.3] } }] };
    var o = fonTerritoireLireGeoJSON(JSON.stringify(gj));
    var utm = fonTerritoireLireGeoJSON(JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[500000, 600000], [500100, 600000], [500100, 600100], [500000, 600000]]] } }));
    var gros = []; for (var i = 0; i < 5000; i++) gros.push([-4 + Math.cos(i / 5000 * 6.2832) * 0.01, 5.35 + Math.sin(i / 5000 * 6.2832) * 0.01]); gros.push(gros[0]);
    var s = fonTerritoireLireGeoJSON(JSON.stringify({ type: 'Feature', properties: { nom: 'Rond' }, geometry: { type: 'Polygon', coordinates: [gros] } }));
    return { zones: o.zones.map(function (z) { return z.nom + ':' + z.anneaux.length + ':' + z.categorie; }), ignores: o.ignores, premierPoint: o.zones[0].anneaux[0][0], utm: utm.erreurs[0], simplifie: s.zones[0].anneaux[0].length, invalide: fonTerritoireLireGeoJSON('pas du json').erreurs[0] };
  }, stub.toString());
  assert.deepEqual(r.zones, ['Forêt A:1:interdit', 'Multi:2:']); assert.equal(r.ignores, 1); assert.deepEqual(r.premierPoint, [5.35, -4]); assert.match(r.utm, /UTM|WGS84/); assert.ok(r.simplifie <= 800 && r.simplifie >= 3); assert.match(r.invalide, /illisible/);
});

test('import : couche + zones créées, ré-import remplace, suppression de la couche refusée tant qu\'elle a des zones', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, carreSrc }) => {
    new Function('(' + st + ')()')();
    var carre = new Function('return ' + carreSrc)();
    DATA.couches_territoriales = []; DATA.zones_territoriales = [];
    var c = { id: 'c1', reference: 'COU-1', nom: 'Forêts classées', type: 'protegee', source: 'Décret n° X', date_source: '2020-01-01', version: '1', statut: 'officiel' }; DATA.couches_territoriales.push(c);
    var gj = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nom: 'Z1' }, geometry: carre(5.35, -4.0, 5.351, -3.9995) }, { type: 'Feature', properties: { nom: 'Z2' }, geometry: carre(5.40, -4.0, 5.401, -3.999) }] };
    var ok = await fonTerritoireImporter('c1', JSON.stringify(gj)); var n1 = fonTerritoireZones('c1').length, cat = fonTerritoireZones('c1')[0].categorie;
    await fonTerritoireImporter('c1', JSON.stringify({ type: 'FeatureCollection', features: [gj.features[0]] })); var n2 = fonTerritoireZones('c1').length;
    var blq = fonRuralSuppressionBloquee('couches', c); await fonTerritoireViderZones('c1', true); var apres = fonRuralSuppressionBloquee('couches', c);
    return { ok: ok, n1: n1, cat: cat, n2: n2, blq: blq, apres: apres, importNb: c.import_nb };
  }, { st: stub.toString(), carreSrc: carre.toString() });
  assert.equal(r.ok, true); assert.equal(r.n1, 2); assert.equal(r.cat, 'interdit'); assert.equal(r.n2, 1); assert.match(r.blq[0], /zone\(s\)/); assert.deepEqual(r.apres, []);
});

test('contrôle : part de la parcelle, niveaux, couches obsolètes ignorées, absence de couche ou de contour sans fausse conformité', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, parc, carreSrc }) => {
    new Function('(' + st + ')()')();
    var carre = new Function('return ' + carreSrc)(), o = {};
    DATA.couches_territoriales = []; DATA.zones_territoriales = [];
    var P = { id: 'p1', ref: 'P1', geo_polygon: parc }, SC = { id: 'p2', ref: 'P2' };
    o.sansCouche = fonTerritoireControle(P); 
    DATA.couches_territoriales.push({ id: 'cp', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel' }, { id: 'cz', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, { id: 'co', nom: 'Ancienne', type: 'protegee', version: '0', statut: 'obsolete' }, { id: 'ci', nom: 'SDUGA', type: 'sduga', version: '1', statut: 'officiel' });
    var z = function (cid, nom, cat, g) { DATA.zones_territoriales.push({ id: 'z' + nom, couche_id: cid, nom: nom, categorie: cat, anneaux: g.coordinates.map(function (pg) { return pg.map(function (q) { return [q[1], q[0]]; }); }).slice(0, 1).concat([]), bbox: [5.3, -4.1, 5.4, -3.9] }); };
    z('cp', 'Moitié', 'interdit', carre(5.350, -4.0, 5.351, -3.9995));   /* ≈ 50 % de la parcelle */
    z('cz', 'Petit coin', 'sous_condition', carre(5.3508, -4.0, 5.351, -3.9992));
    z('co', 'Obsolète', 'interdit', carre(5.350, -4.0, 5.351, -3.999));
    z('ci', 'Orientation', 'info', carre(5.35, -4.0, 5.351, -3.999));
    z('cp', 'Loin', 'interdit', carre(5.40, -4.0, 5.401, -3.999));
    var C = fonTerritoireControle(P); o.coucheNoms = C.couches.map(function (c) { return c.nom; }); o.cx = C.croisements.map(function (x) { return x.zone_nom + ':' + x.niveau + ':' + x.point + ':' + (x.pct > 0); });
    o.pctMoitie = C.croisements.filter(function (x) { return x.zone_nom === 'Moitié'; })[0].pct; o.aire = C.aire_m2;
    o.sansContour = fonTerritoireControle(SC);
    return o;
  }, { st: stub.toString(), parc: PARC, carreSrc: carre.toString() });
  assert.equal(r.sansCouche.couches.length, 0); assert.equal(r.sansCouche.croisements.length, 0);
  assert.deepEqual(r.coucheNoms, ['Forêts', 'ZAD', 'SDUGA']);
  assert.deepEqual(r.cx, ['Moitié:critique:AUD-JUR-03:true', 'Petit coin:majeur:AUD-TECH-03:true', 'Orientation:info:AUD-TECH-03:true']);
  assert.ok(r.pctMoitie > 40 && r.pctMoitie < 60, 'part ≈ 50 % : ' + r.pctMoitie); assert.ok(r.aire > 10000 && r.aire < 14000);
  assert.equal(r.sansContour.contour, false); assert.equal(r.sansContour.croisements.length, 0);
});

test('audit : panneau, contrôle consigné sans changer le statut, GO critique réservé à l\'administrateur avec motif', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, parc, carreSrc }) => {
    new Function('(' + st + ')()')();
    var carre = new Function('return ' + carreSrc)(), o = {}; window.fcEstAdmin = function () { return false; };
    DATA.parcelles = [{ id: 'p1', ref: 'P1', geo_polygon: parc }]; DATA.couches_territoriales = [{ id: 'cp', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel' }];
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve', categorie: 'interdit', anneaux: [[[5.35, -4.0], [5.35, -3.9995], [5.351, -3.9995], [5.351, -4.0]]], bbox: [5.3, -4.1, 5.4, -3.9] }];
    var a = { id: 'a1', reference: 'AUD-1', parcelle_id: 'p1', zone: 'urbain', points: {}, visas: {}, decision: 'en_attente', historique: [] };
    FON_AUDIT_POINTS.forEach(function (d) { a.points[d.code] = { statut: 'a_verifier', piece_ref: '', observation: '' }; });
    DATA.audits_fonciers = [a]; window.fonRuralRender = function () {}; window.fonAuditOuvrir = fonAuditOuvrir;
    document.body.insertAdjacentHTML('beforeend', '<div id="modal-fon-audit"></div><div id="fon-audit-titre"></div><div id="fon-audit-corps"></div>');
    fonAuditOuvrir('a1'); o.avantLancer = /Lancer le contrôle territorial/.test(document.getElementById('fon-audit-corps').innerHTML);
    await fonTerritoireAuditLancer('a1'); var html = document.getElementById('fon-audit-corps').innerHTML;
    o.apres = [/Réserve/.test(html), /AUD-JUR-03/.test(html), /Cela ne vaut pas conformité|n'autorise rien/.test(html)]; o.snap = a.controle_territorial.croisements.length;
    var avantStatut = a.points['AUD-JUR-03'].statut; await fonTerritoireAuditConsigner('a1', 0);
    o.obs = /Contrôle territorial .* en « Réserve »/.test(a.points['AUD-JUR-03'].observation); o.statutInchange = a.points['AUD-JUR-03'].statut === avantStatut && avantStatut === 'a_verifier';
    await fonTerritoireAuditConsigner('a1', 0); o.pasDeDoublon = (a.points['AUD-JUR-03'].observation.match(/Contrôle territorial/g) || []).length === 1;
    o.garde = fonTerritoireGarde(a); var T = window.__T = []; var r1 = await fonAuditDecider('a1', 'go'); o.refusNonAdmin = r1 === false && /administrateur/.test(T.join(' '));
    DATA.couches_territoriales = []; o.sansCouche = /Aucune couche territoriale active/.test((fonAuditOuvrir('a1'), document.getElementById('fon-audit-corps').innerHTML));
    return o;
  }, { st: stub.toString(), parc: PARC, carreSrc: carre.toString() });
  assert.equal(r.avantLancer, true); assert.deepEqual(r.apres, [true, true, true]); assert.equal(r.snap, 1); assert.equal(r.obs, true); assert.equal(r.statutInchange, true); assert.equal(r.pasDeDoublon, true);
  assert.equal(r.garde.critique, true); assert.equal(r.refusNonAdmin, true); assert.equal(r.sansCouche, true);
});
