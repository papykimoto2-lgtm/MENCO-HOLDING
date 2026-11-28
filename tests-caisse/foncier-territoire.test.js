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
    var src = { source: 'Décret test', date_source: '2020-01-01' }; DATA.couches_territoriales.push(Object.assign({ id: 'cp', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel' }, src), Object.assign({ id: 'cz', nom: 'ZAD', type: 'zad', version: '1', statut: 'indicatif' }, src), Object.assign({ id: 'co', nom: 'Ancienne', type: 'protegee', version: '0', statut: 'obsolete' }, src), Object.assign({ id: 'ci', nom: 'SDUGA', type: 'sduga', version: '1', statut: 'officiel' }, src), { id: 'cs', nom: 'Sans provenance', type: 'protegee', version: '1', statut: 'officiel' });
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
    DATA.parcelles = [{ id: 'p1', ref: 'P1', geo_polygon: parc }]; DATA.couches_territoriales = [{ id: 'cp', nom: 'Forêts', type: 'protegee', version: '3', statut: 'officiel', source: 'Décret test', date_source: '2020-01-01' }];
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

const KML = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Forêt classée Test</name><ExtendedData><Data name="categorie"><value>interdit</value></Data><Data name="ref"><value>D-12</value></Data></ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-4.0,5.35,0 -3.99,5.35,0 -3.99,5.36,0 -4.0,5.36,0 -4.0,5.35,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Multi</name><MultiGeometry>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-4.0,5.30,0 -3.99,5.30,0 -3.99,5.31,0 -4.0,5.30,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-3.9,5.30,0 -3.89,5.30,0 -3.89,5.31,0 -3.9,5.30,0</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>
<Placemark><name>Un point</name><Point><coordinates>-4.0,5.3,0</coordinates></Point></Placemark></Document></kml>`;

test('KML : polygones, multigéométries, propriétés et ignorés ; KMZ lu comme un zip', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, kml }) => {
    new Function('(' + st + ')()')();
    var g = fonTerritoireKmlVersGeoJSON(kml), R = fonTerritoireLireGeoJSON(JSON.stringify(g)), o = {};
    o.zones = R.zones.map(function (z) { return z.nom + ':' + z.anneaux.length + ':' + z.categorie + ':' + (z.proprietes.ref || ''); }); o.ignores = R.ignores; o.illisible = fonTerritoireKmlVersGeoJSON('<kml><oups');
    /* KMZ : archive « stockée » (méthode 0) fabriquée à la main */
    var enc = new TextEncoder(), nom = enc.encode('doc.kml'), data = enc.encode(kml), crc = function () { return 0; };
    var lh = new Uint8Array(30 + nom.length + data.length), dv = new DataView(lh.buffer); dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, 0, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nom.length, true); lh.set(nom, 30); lh.set(data, 30 + nom.length);
    var cd = new Uint8Array(46 + nom.length), dc = new DataView(cd.buffer); dc.setUint32(0, 0x02014b50, true); dc.setUint16(10, 0, true); dc.setUint32(20, data.length, true); dc.setUint32(24, data.length, true); dc.setUint16(28, nom.length, true); dc.setUint32(42, 0, true); cd.set(nom, 46);
    var eo = new Uint8Array(22), de = new DataView(eo.buffer); de.setUint32(0, 0x06054b50, true); de.setUint16(10, 1, true); de.setUint32(12, cd.length, true); de.setUint32(16, lh.length, true);
    var zip = new Uint8Array(lh.length + cd.length + eo.length); zip.set(lh, 0); zip.set(cd, lh.length); zip.set(eo, lh.length + cd.length);
    var f = new File([zip], 'couche.kmz'); var txt = await fonTerritoireTexteDeFichier(f); o.kmz = fonTerritoireLireGeoJSON(txt).zones.length;
    o.kmlFichier = fonTerritoireLireGeoJSON(await fonTerritoireTexteDeFichier(new File([kml], 'couche.kml'))).zones.length;
    return o;
  }, { st: stub.toString(), kml: KML });
  assert.deepEqual(r.zones, ['Forêt classée Test:1:interdit:D-12', 'Multi:2::']); assert.equal(r.ignores, 1); assert.equal(r.illisible, null); assert.equal(r.kmz, 2); assert.equal(r.kmlFichier, 2);
});

test('coordonnées projetées : refus sans zone, conversion UTM avec zone, hors Côte d\'Ivoire signalé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st }) => {
    new Function('(' + st + ')()')();
    var o = {}, utm = function (E, N) { return [E, N]; };
    /* 5,35 N ; -4,00 E ≈ UTM 30N : E ≈ 500000 − 0,0 ; on génère via latLngToUtm pour rester exact */
    var a = latLngToUtm(5.35, -4.0, 30), b = latLngToUtm(5.36, -3.99, 30);
    var gj = JSON.stringify({ type: 'Feature', properties: { nom: 'UTM' }, geometry: { type: 'Polygon', coordinates: [[[a.E, a.N], [b.E, a.N], [b.E, b.N], [a.E, b.N], [a.E, a.N]]] } });
    var sans = fonTerritoireLireGeoJSON(gj); o.sansZone = [sans.projete, sans.zones.length, /UTM/.test(sans.erreurs[0] || '')];
    var avec = fonTerritoireLireGeoJSON(gj, { utm: 30 }); var p = avec.zones[0].anneaux[0][0]; o.conv = [avec.zones.length, Math.abs(p[0] - 5.35) < 1e-4, Math.abs(p[1] + 4.0) < 1e-4];
    o.hors = fonTerritoireHorsPays([{ bbox: [5.3, -4.1, 5.4, -3.9] }, { bbox: [48.8, 2.3, 48.9, 2.4] }, { bbox: [-4.0, 5.3, -3.9, 5.4] }]);   /* Abidjan ; Paris ; lat/lng inversés */
    return o;
  }, { st: stub.toString() });
  assert.deepEqual(r.sansZone, [true, 0, true]); assert.deepEqual(r.conv, [1, true, true]); assert.equal(r.hors, 2);
});

test('couches types et provenance : inactives sans source, import refusé sans provenance, activation à l\'import, désactivation', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, parc }) => {
    new Function('(' + st + ')()')();
    var o = {}; DATA.couches_territoriales = []; DATA.zones_territoriales = [];
    await fonTerritoireCreerModeles(); o.crees = DATA.couches_territoriales.length; o.inactives = DATA.couches_territoriales.every(function (c) { return c.actif === false && c.statut === 'projet'; });
    await fonTerritoireCreerModeles(); o.idempotent = DATA.couches_territoriales.length === o.crees;
    var c = DATA.couches_territoriales[0], gj = JSON.stringify({ type: 'Feature', properties: { nom: 'Z' }, geometry: { type: 'Polygon', coordinates: [[[-4.0, 5.35], [-3.9995, 5.35], [-3.9995, 5.351], [-4.0, 5.351], [-4.0, 5.35]]] } });
    window.__T = []; o.refus = await fonTerritoireImporter(c.id, gj); o.msgRefus = /source, la date et la version/.test(window.__T.join(' '));
    o.controleSansProvenance = fonTerritoireCouchesActives().length;
    Object.assign(c, { source: 'Arrêté test', date_source: '2023-05-01', version: '1' });
    o.ok = await fonTerritoireImporter(c.id, gj); o.activee = c.actif === true; o.controleApres = fonTerritoireCouchesActives().map(function (x) { return x.nom; }).length;
    await fonTerritoireBasculer(c.id); o.desactivee = c.actif === false; o.controleDesactivee = fonTerritoireCouchesActives().length;
    await fonTerritoireBasculer(c.id); o.reactivee = c.actif === true;
    return o;
  }, { st: stub.toString(), parc: PARC });
  assert.equal(r.crees, 7); assert.equal(r.inactives, true); assert.equal(r.idempotent, true); assert.equal(r.refus, false); assert.equal(r.msgRefus, true); assert.equal(r.controleSansProvenance, 0);
  assert.equal(r.ok, true); assert.equal(r.activee, true); assert.equal(r.controleApres, 1); assert.equal(r.desactivee, true); assert.equal(r.controleDesactivee, 0); assert.equal(r.reactivee, true);
});

test('accès au Territoire : bouton dans le cadre vide de l\'audit, dans la liste des audits et phrase dans le formulaire de création', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st }) => {
    new Function('(' + st + ')()')();
    var o = {}, cible = []; window.fonAller = function (c) { cible.push(c); return true; };
    DATA.couches_territoriales = []; DATA.zones_territoriales = []; DATA.parcelles = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; DATA.audits_fonciers = [];
    var a = { id: 'a1', reference: 'AUD-1', parcelle_id: 'p1', zone: 'rural', points: {}, visas: {}, decision: 'en_attente', historique: [] };
    var html = fonTerritoireAuditHtml(a); o.bouton = /Aller à Territoire/.test(html) && /fonTerritoireAller\(\)/.test(html);
    document.body.insertAdjacentHTML('beforeend', '<div id="modal-fon-audit" class="modal-overlay open"></div><div id="fon-audit-titre"></div><div id="fon-audit-corps"></div>');
    fonTerritoireAller(); o.cible = cible[0]; o.ferme = !document.getElementById('modal-fon-audit').classList.contains('open');
    fonAuditNouveau(); o.phrase = /contrôle territorial/.test(document.getElementById('fon-audit-corps').innerHTML) && /fiche d'audit/.test(document.getElementById('fon-audit-corps').innerHTML);
    document.body.insertAdjacentHTML('beforeend', '<div id="fon-rural-liste"></div><div id="fon-rural-onglets"></div>'); fonAuditRender(); o.liste = /tab:territoire/.test(document.getElementById('fon-rural-onglets').innerHTML);
    return o;
  }, { st: stub.toString() });
  assert.equal(r.bouton, true); assert.equal(r.cible, 'tab:territoire'); assert.equal(r.ferme, true); assert.equal(r.phrase, true); assert.equal(r.liste, true);
});
