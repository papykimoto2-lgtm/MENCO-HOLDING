/* Foncier — carte des sols : nature déduite d'une couche « Sols », sondages géolocalisés, proximité, bouton, panneau, validation, échappement. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.syncToSupabase = function () {}; window.logAction = async function () {};
};
test('nature du sol : clés, libellés, accents, synonymes, inconnu', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(() => ['sable_dense', 'Argile molle', 'VASE', 'Sable lâche', 'Sable fin dense', 'Cuirasse latéritique', 'Terre végétale', 'Gravillons', 'Limon argileux', 'Béton', ''].map(fonSolNatureDepuis));
  assert.deepEqual(r, ['sable_dense', 'argile_molle', 'argile_molle', 'sable_lache', 'sable_dense', 'laterite', 'remblai', 'graveleux', 'argile', '', '']);
});
test('couche Sols : type proposé, nature lue dans les propriétés, catégorie selon la portance, couleur par nature', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {};
    o.type = !!FON_TER_TYPES.sols; o.def = FON_TER_CATEGORIE_DEFAUT.sols;
    o.n1 = fonSolNatureZone({ nom: 'Z1', proprietes: { SOL: 'Argile molle' } }); o.n2 = fonSolNatureZone({ nom: 'Sable dense', proprietes: {} }); o.n3 = fonSolNatureZone({ nom: 'Zone 9', proprietes: { code: 'x' } });
    DATA.couches_territoriales = [{ id: 'c', nom: 'Sols', type: 'sols', source: 'BNETD', date_source: '2020-01-01', version: '1', statut: 'indicatif' }];
    DATA.zones_territoriales = [{ id: 'z', couche_id: 'c', nom: 'Z1', nature: 'argile_molle', categorie: 'sous_condition', anneaux: [[[5.3, -4], [5.3, -3.9], [5.4, -3.9]]], bbox: [5.3, -4, 5.4, -3.9] }];
    var f = fonTerritoireGeoZones().features[0].properties; o.coul = f.couleur === GEO_NATURES.argile_molle.coul; o.nat = f.nature;
    return o;
  }, { st: stub.toString() });
  assert.ok(r.type && r.coul); assert.equal(r.def, 'info'); assert.equal(r.n1, 'argile_molle'); assert.equal(r.n2, 'sable_dense'); assert.equal(r.n3, ''); assert.equal(r.nat, 'argile_molle');
});
test('sondages : géo, proximité triée, inactifs et sans position écartés, popup échappé, bouton Sols', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {};
    DATA.sondages_sols = [{ id: 's1', nom: 'SC1 <b>', reference: 'SOL-1', lat: 5.35, lng: -4.0, nature: 'argile_molle', sigma_adm: 0.08, profondeur_m: 6 }, { id: 's2', nom: 'SC2', lat: 5.352, lng: -4.0, nature: 'sable_dense' },
      { id: 's3', nom: 'Loin', lat: 5.40, lng: -4.0, nature: 'argile' }, { id: 's4', nom: 'Inactif', lat: 5.35, lng: -4.0, nature: 'argile', actif: false }, { id: 's5', nom: 'Sans pos', nature: 'argile' }];
    o.actifs = fonSondagesActifs().length; o.feat = fonSondagesGeo().features.length;
    var p = fonSondagesProches(5.3501, -4.0, 300); o.proches = p.map(function (x) { return x.sondage.id; }).join(','); o.d0 = p[0].distance_m;
    var h = fonSondageHtml(DATA.sondages_sols[0]); o.echappe = !/SC1 <b>/.test(h) && /SC1 &lt;b&gt;/.test(h); o.nonPortant = /non portant/.test(h); o.mention = /ne vaut pas étude/.test(h);
    o.bouton = /🪨<span class="ft-l"> Sols<\/span>/.test(fonTerritoireBarreHtml()); o.panneau = /2 sondage|3 sondage/.test(fonSondagesPanneauHtml()) ? 'ok' : fonSondagesPanneauHtml().slice(0, 120);
    return o;
  }, { st: stub.toString() });
  assert.equal(r.actifs, 3); assert.equal(r.feat, 3); assert.equal(r.proches, 's1,s2'); assert.ok(r.d0 < 30); assert.deepEqual([r.echappe, r.nonPortant, r.mention, r.bouton], [true, true, true, true]); assert.equal(r.panneau, 'ok');
});
test('« Où suis-je ? » affiche les sondages proches ; formulaire prérempli ; position hors pays refusée', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async ({ st }) => {
    new Function('(' + st + ')()')(); var o = {};
    DATA.sondages_sols = [{ id: 's1', nom: 'SC1', lat: 5.35, lng: -4.0, nature: 'argile_molle', sigma_adm: 0.08 }]; DATA.couches_territoriales = []; DATA.zones_territoriales = []; DATA.parcelles = [{ id: 'p1', ref: 'P1' }];
    window.fonGpsPosition = async function () { return { lat: 5.3501, lng: -4.0, acc: 5 }; };
    document.body.insertAdjacentHTML('beforeend', '<div id="fon-terrain-point"></div>'); var res = await fonTerrainOuSuisJe(); o.html = /SC1/.test(document.getElementById('fon-terrain-point').innerHTML) && /non portant/.test(document.getElementById('fon-terrain-point').innerHTML);
    FON_RURAL.terrainParcelle = 'p1'; await fonSondageIci(); o.lat = document.getElementById('fonr-lat') && document.getElementById('fonr-lat').value; o.parc = document.getElementById('fonr-parcelle_id') && document.getElementById('fonr-parcelle_id').value;
    document.getElementById('fonr-nom').value = 'SC9'; document.getElementById('fonr-lat').value = '45'; document.getElementById('fonr-lng').value = '-4'; await fonRuralEnregistrer(); o.refus = (window.__T || []).slice(-1)[0]; o.nb = DATA.sondages_sols.length;
    document.getElementById('fonr-lat').value = '-4'; document.getElementById('fonr-lng').value = '5.3'; await fonRuralEnregistrer(); o.inverse = (window.__T || []).slice(-1)[0];
    document.getElementById('fonr-lat').value = '5.36'; document.getElementById('fonr-lng').value = '-4.01'; await fonRuralEnregistrer(); o.apres = DATA.sondages_sols.length; o.ref = DATA.sondages_sols.slice(-1)[0].reference;
    return o;
  }, { st: stub.toString() });
  assert.ok(r.html); assert.equal(Number(r.lat), 5.3501); assert.equal(r.parc, 'p1'); assert.match(r.refus, /hors de la Côte/); assert.equal(r.nb, 1); assert.match(r.inverse, /inversées/); assert.equal(r.apres, 2); assert.match(r.ref, /^SOL-\d{4}-\d{3}$/);
});
