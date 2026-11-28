/* Foncier — veille de secteurs : analyse, comparaison, alerte à l'import, dessin, carte, rapport. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const MAPLIBRE = process.env.MAPLIBRE_DIST || path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dispo = fs.existsSync(path.join(MAPLIBRE, 'maplibre-gl.js'));
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {}; window.confirm = function () { return true; };
  window.__LOG = []; window.logAction = async function (a, d) { window.__LOG.push(a + ' ' + d); };
};
const carre = (lat0, lng0, lat1, lng1) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const PREP = () => {
  var poly = function (lat0, lng0, lat1, lng1) { return [[lng0, lat0], [lng1, lat0], [lng1, lat1], [lng0, lat1], [lng0, lat0]]; };
  window.__poly = poly; window.__gj = function (feats) { return JSON.stringify({ type: 'FeatureCollection', features: feats.map(function (f) { return { type: 'Feature', properties: { nom: f[0] }, geometry: { type: 'Polygon', coordinates: [f[1]] } }; }) }); };
  DATA.couches_territoriales = [{ id: 'cp', reference: 'COU-1', nom: 'Forêts <b>classées</b>', type: 'protegee', version: '1', statut: 'officiel', source: 'Décret', date_source: '2023-01-01', actif: true }];
  DATA.zones_territoriales = []; DATA.parcelles = []; DATA.programmes = []; DATA.af_operations = []; DATA.dossiers_fonciers = []; DATA.audits_fonciers = []; DATA.secteurs_veille = [];
};

test('analyse d\'un secteur : surface, zones qui le recouvrent, parts, parcelles dedans et en alerte', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr, SEC, P1, P2 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    DATA.zones_territoriales = [{ id: 'z1', couche_id: 'cp', nom: 'Réserve A', categorie: 'interdit', anneaux: [[[5.348, -4.004], [5.348, -3.998], [5.353, -3.998], [5.353, -4.004]]], bbox: [5.348, -4.004, 5.353, -3.998] }];
    DATA.parcelles = [{ id: 'p1', ref: 'P-DEDANS', statut: 'acquis', geo_polygon: P1 }, { id: 'p2', ref: 'P-HORS', statut: 'acquis', geo_polygon: P2 }];
    var s = { id: 's1', nom: 'Ahoué', anneau: SEC }, a = fonSecteurAnalyser(s);
    o.aire = a.aire_m2 > 1e6; o.aireval = a.aire_m2; o.zones = a.zones.map(function (z) { return z.nom + ':' + z.pct; }); o.cumul = a.cumul.interdit; o.parc = [a.parcelles.n, a.parcelles.alerte, a.parcelles.critique, a.parcelles.refs.map(function (x) { return x.ref; }).join()];
    o.sansCouche = (function () { DATA.couches_territoriales[0].actif = false; var b = fonSecteurAnalyser(s); DATA.couches_territoriales[0].actif = true; return [b.zones.length, b.couches.length]; })();
    o.degenere = fonSecteurAnalyser({ anneau: [[5, -4], [5.1, -4]] }).aire_m2; return o;
  }, { st: stub.toString(), pr: PREP.toString(), SEC: carre(5.345, -4.006, 5.356, -3.996), P1: carre(5.349, -4.002, 5.351, -4.000), P2: carre(5.400, -3.900, 5.401, -3.899) });
  assert.equal(r.aire, true); assert.equal(r.zones.length, 1); assert.match(r.zones[0], /^Réserve A:/); assert.ok(r.cumul > 25 && r.cumul < 30, 'part attendue ≈ 27 % : ' + r.cumul);   /* 0,005° × 0,006° sur 0,011° × 0,010° */
  assert.deepEqual(r.parc.slice(0, 3), [1, 1, 1]); assert.equal(r.parc[3], 'P-DEDANS'); assert.deepEqual(r.sansCouche, [0, 0]); assert.equal(r.degenere, 0);
});

test('comparaison : première analyse = état de départ ; zones nouvelles, disparues, modifiées, versions et parcelles', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(() => {
    var z = function (n, pct, c) { return { couche_id: c || 'c1', couche_nom: 'Couche', nom: n, categorie: 'interdit', pct: pct }; };
    var A = { couches: [{ id: 'c1', nom: 'Couche', version: '1' }], zones: [z('Alpha', 10), z('Beta', 20)], parcelles: { alerte: 1 } };
    var o = {}; o.depart = fonSecteurDiff(null, A);
    o.identique = fonSecteurDiff(A, JSON.parse(JSON.stringify(A))).vide;
    var B = { couches: [{ id: 'c1', nom: 'Couche', version: '2' }, { id: 'c2', nom: 'Autre', version: '1' }], zones: [z('Alpha', 40), z('Gamma', 5)], parcelles: { alerte: 3 } };
    var d = fonSecteurDiff(A, B); o.d = { vide: d.vide, nouvelles: d.nouvelles.map(function (x) { return x.nom; }), disparues: d.disparues.map(function (x) { return x.nom; }), changees: d.changees.map(function (x) { return x.nom + ':' + x.de + '>' + x.a; }), versions: d.versions.map(function (x) { return x.couche + ':' + x.de + '>' + x.a; }), dp: d.delta_parcelles_alerte };
    o.petite = fonSecteurDiff(A, { couches: A.couches, zones: [z('Alpha', 12), z('Beta', 20)], parcelles: { alerte: 1 } }).vide; return o;
  });
  assert.equal(r.depart, null); assert.equal(r.identique, true); assert.equal(r.petite, true);   /* écart de 2 points : pas une alerte */
  assert.deepEqual(r.d, { vide: false, nouvelles: ['Gamma'], disparues: ['Beta'], changees: ['Alpha:10>40'], versions: ['Couche:v1>v2', 'Autre:(non contrôlée)>v1'], dp: 2 });
});

test('veille : un import de couche ré-analyse les secteurs, signale le changement, journalise ; secteur suspendu ignoré ; marquer comme examiné', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr, SEC, P1 }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    DATA.parcelles = [{ id: 'p1', ref: 'P-UN', statut: 'acquis', geo_polygon: P1 }];
    await fonTerritoireImporter('cp', __gj([['Réserve A', __poly(5.330, -4.004, 5.333, -3.998)]]));   /* loin du secteur */
    var sct = { id: 's1', reference: 'SEC-1', nom: 'Ahoué <i>nord</i>', actif: true, priorite: 'haute', anneau: SEC }; sct.analyse = fonSecteurAnalyser(sct); sct.alertes = [];
    var susp = { id: 's2', reference: 'SEC-2', nom: 'Suspendu', actif: false, anneau: SEC }; DATA.secteurs_veille = [sct, susp];
    DATA.couches_territoriales[0].version = '2'; window.__T = []; window.__LOG = [];
    await fonTerritoireImporter('cp', __gj([['Réserve A', __poly(5.348, -4.004, 5.353, -3.998)]]));
    var x = DATA.secteurs_veille[0]; o.non_lu = x.non_lu === true; o.alerte = x.alertes.length === 1 && x.alertes[0].nouvelles.map(function (z) { return z.nom; }).join() === 'Réserve A' && /Import de la couche/.test(x.alertes[0].cause);
    o.versions = x.alertes[0].versions.map(function (v) { return v.de + '>' + v.a; }).join(); o.parcelles = x.alertes[0].delta_parcelles_alerte;
    o.suspendu = !DATA.secteurs_veille[1].alertes && !DATA.secteurs_veille[1].non_lu; o.toast = window.__T.join(' '); o.log = window.__LOG.join('|');
    o.html = fonSecteursHtml(); FON_TER.secSel = 's1'; o.detail = fonSecteursHtml();
    await fonSecteurLu('s1'); o.lu = DATA.secteurs_veille[0].non_lu === false;
    window.__T = []; var r2 = await fonTerritoireVeille('Test'); o.sansChangement = [r2.analyses, r2.changes, DATA.secteurs_veille[0].alertes.length];
    return o;
  }, { st: stub.toString(), pr: PREP.toString(), SEC: carre(5.345, -4.006, 5.356, -3.996), P1: carre(5.349, -4.002, 5.351, -4.000) });
  assert.equal(r.non_lu, true); assert.equal(r.alerte, true); assert.equal(r.versions, 'v1>v2'); assert.equal(r.parcelles, 1); assert.equal(r.suspendu, true);
  assert.match(r.toast, /1 secteur\(s\) surveillé\(s\) à examiner/); assert.match(r.log, /FONCIER_SECTEUR_VEILLE Import de la couche/);
  assert.match(r.html, /à examiner/); assert.match(r.html, /Ahoué &lt;i&gt;nord&lt;\/i&gt;/); assert.doesNotMatch(r.html, /<i>nord/); assert.match(r.detail, /nouvelles zones/); assert.match(r.detail, /Réserve A/); assert.match(r.detail, /Marquer comme examiné/);
  assert.equal(r.lu, true); assert.deepEqual(r.sansChangement, [1, 0, 1]);
});

test('dessin : sommets, retrait, annulation, minimum 3 sommets, nom obligatoire, enregistrement avec analyse de départ', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    fonTerritoireDessinDemarrer(); fonTerritoireDessinAjouter(-4.0, 5.35); fonTerritoireDessinAjouter(-3.99, 5.35); window.__T = []; await fonTerritoireDessinTerminer(); o.deux = window.__T.join(' ');
    fonTerritoireDessinAjouter(-3.99, 5.36); fonTerritoireDessinAjouter(-4.0, 5.36); fonTerritoireDessinRetirer(); o.pts = FON_TER.dessin.pts.length;
    fonTerritoireDessinAjouter(-4.0, 5.36); window.prompt = function () { return 'ab'; }; window.__T = []; await fonTerritoireDessinTerminer(); o.nomCourt = window.__T.join(' ') + '|' + (FON_TER.dessin ? 'encore' : 'fini') + '|' + DATA.secteurs_veille.length;
    window.prompt = function () { return null; }; await fonTerritoireDessinTerminer(); o.annule = (FON_TER.dessin ? 'encore' : 'fini') + '|' + DATA.secteurs_veille.length;
    window.prompt = function () { return 'Brofodoumé'; }; window.__LOG = []; await fonTerritoireDessinTerminer(); var s = DATA.secteurs_veille[0];
    o.cree = [DATA.secteurs_veille.length, s && s.nom, s && s.reference, s && s.anneau.length, s && s.anneau[0].join(), s && s.aire_m2 > 1e5, s && !!s.analyse, FON_TER.dessin === null, window.__LOG.join()];
    fonTerritoireDessinDemarrer(); fonTerritoireDessinAjouter(-4, 5); fonTerritoireDessinAnnuler(); o.annulation = FON_TER.dessin === null;
    fonTerritoireDessinDemarrer(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); o.echap = FON_TER.dessin === null;
    o.barre = fonTerritoireBarreHtml().indexOf('Secteur') !== -1; return o;
  }, { st: stub.toString(), pr: PREP.toString() });
  assert.match(r.deux, /3 sommets/); assert.equal(r.pts, 3); assert.match(r.nomCourt, /3 caractères/); assert.match(r.nomCourt, /encore\|0/); assert.equal(r.annule, 'encore|0');
  assert.equal(r.cree[0], 1); assert.equal(r.cree[1], 'Brofodoumé'); assert.match(r.cree[2], /^SEC-\d{4}-001$/); assert.equal(r.cree[3], 4); assert.equal(r.cree[4], '5.35,-4'); assert.equal(r.cree[5], true); assert.equal(r.cree[6], true); assert.equal(r.cree[7], true); assert.match(r.cree[8], /FONCIER_SECTEUR_VEILLE/);
  assert.equal(r.annulation, true); assert.equal(r.echap, true); assert.equal(r.barre, true);
});

test('import de secteurs : un secteur par polygone ; hors Côte d\'Ivoire refusé ; rapport direction avec la section secteurs', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st, pr }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); var o = {};
    o.n = await fonSecteurImporter(__gj([['Aghien <b>Télégraphe</b>', __poly(5.40, -4.05, 5.42, -4.02)], ['Bingerville–Adjin', __poly(5.34, -3.90, 5.36, -3.87)]]));
    o.noms = DATA.secteurs_veille.map(function (x) { return x.nom; }).join('|'); window.__T = [];
    o.hors = await fonSecteurImporter(__gj([['Ailleurs', __poly(48.8, 2.3, 48.9, 2.4)]])); o.msg = window.__T.join(' ');
    DATA.secteurs_veille[0].non_lu = true; o.rapport = fonSecteursRapportHtml(); return o;
  }, { st: stub.toString(), pr: PREP.toString() });
  assert.equal(r.n, 2); assert.match(r.noms, /Aghien <b>Télégraphe<\/b>/); assert.equal(r.hors, 0); assert.match(r.msg, /hors de la Côte d'Ivoire/);
  assert.match(r.rapport, /Secteurs surveillés \(2\)/); assert.match(r.rapport, /Aghien &lt;b&gt;Télégraphe/); assert.doesNotMatch(r.rapport, /<b>Télégraphe/); assert.match(r.rapport, /changement\(s\) à examiner/);
});

test('carte : secteurs dessinés en pointillé, un clic ajoute un sommet pendant le dessin et n\'ouvre aucune fenêtre', { skip: !dispo && 'maplibre-gl absent' }, async () => {
  const app = await ouvrirApp();
  await app.page.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') }); await app.page.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await app.page.evaluate(({ st, pr, SEC }) => {
    new Function('(' + st + ')()')(); new Function('(' + pr + ')()')(); window.__FON_TER_STYLE_HORS_LIGNE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } }] };
    var s = { id: 's1', reference: 'SEC-1', nom: 'Ahoué', actif: true, anneau: SEC }; s.analyse = fonSecteurAnalyser(s); DATA.secteurs_veille = [s];
    var pane = document.getElementById('tab-foncier-territoire'), n = pane; while (n && n !== document.documentElement) { n.style.display = 'block'; n.style.visibility = 'visible'; n = n.parentElement; }
    pane.classList.add('active'); FON_TER.vue = null; fonTerritoireRender();
  }, { st: stub.toString(), pr: PREP.toString(), SEC: carre(5.345, -4.006, 5.356, -3.996) });
  await app.page.waitForFunction(() => window.FON_TER && FON_TER.pret === true, null, { timeout: 15000 });
  const r = await app.page.evaluate(async () => {
    var m = FON_TER.map, o = {}; await new Promise(function (r) { setTimeout(r, 400); });
    o.couches = ['sect-fill', 'sect-line', 'dessin-line', 'dessin-pts'].map(function (l) { return !!m.getLayer(l); }); o.nb = m.getSource('secteurs') && fonSecteursGeoJSON().features.length;
    o.visible = m.getLayoutProperty('sect-line', 'visibility'); fonTerritoireOption('secteurs'); o.masque = m.getLayoutProperty('sect-line', 'visibility'); fonTerritoireOption('secteurs');
    fonTerritoireDessinDemarrer(); m.fire('click', { lngLat: { lng: -4.0, lat: 5.35 }, point: { x: 10, y: 10 }, originalEvent: {} }); m.fire('click', { lngLat: { lng: -3.99, lat: 5.35 }, point: { x: 20, y: 10 }, originalEvent: {} });
    o.pts = FON_TER.dessin.pts.length; o.popup = document.querySelectorAll('.maplibregl-popup').length; fonTerritoireDessinAnnuler(); o.fin = FON_TER.dessin === null; return o;
  });
  assert.deepEqual(r.couches, [true, true, true, true]); assert.equal(r.nb, 1); assert.equal(r.visible, 'visible'); assert.equal(r.masque, 'none'); assert.equal(r.pts, 2); assert.equal(r.popup, 0); assert.equal(r.fin, true);
});
