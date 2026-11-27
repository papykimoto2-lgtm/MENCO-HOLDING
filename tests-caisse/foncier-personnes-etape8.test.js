/* Foncier L17 étape 8 — audit : suppression protégée, droits par store, échec sans lien partiel, journal, performance. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

const stub = () => {
  window.toast = function () {}; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
  window.syncToSupabase = function () {}; window.logAction = function () {}; window.fonRuralRender = function () {}; window.confirm = function () { return true; }; window.hasRole = function () { return true; };
};

test('suppression d\'une fiche du référentiel : refusée tant que des saisies lui sont reliées ou qu\'une fiche y est fusionnée', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    DATA.personnes_fonciers = [{ id: 'pe1', nom: 'Aka Paul' }, { id: 'pe2', nom: 'Aka Pauline', fusionnee_dans: 'pe1' }, { id: 'pe3', nom: 'Libre' }];
    DATA.proprietaires_fonciers = [{ id: 'r1', proprietaire: 'Aka Paul', liens_personnes: { proprietaire: 'pe1' } }]; DATA.ayants_droit_fonciers = []; DATA.af_operations = []; DATA.parcelles = []; DATA.clients = []; DATA.intervenants_fonciers = []; DATA.villages_fonciers = []; DATA.protocoles_purge_fonciers = [];
    var a = fonRuralSuppressionBloquee('personnes', DATA.personnes_fonciers[0]), c = fonRuralSuppressionBloquee('personnes', DATA.personnes_fonciers[2]);
    return { a: a, c: c };
  }, stub.toString());
  assert.equal(r.a.length, 2); assert.match(r.a[0], /1 saisie\(s\) reliée\(s\)/); assert.match(r.a[1], /1 fiche\(s\) fusionnée\(s\)/); assert.deepEqual(r.c, []);
});

test('droits : sans droit sur Souscripteurs, le lien n\'est pas posé et rien de partiel ne reste', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    var T = []; window.toast = function (m) { T.push(m); };
    window.userPeutSurStore = function (s) { return s !== 'clients'; };
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Aka Paul' }]; DATA.clients = [{ id: 'c1', nom: 'AKA', prenoms: 'Paul' }]; DATA.proprietaires_fonciers = [{ id: 'r1', proprietaire: 'Aka Paul' }];
    DATA.af_operations = []; DATA.parcelles = []; DATA.intervenants_fonciers = []; DATA.villages_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.protocoles_purge_fonciers = [];
    var src = fonPersonnesSources().filter(function (o) { return o.store === 'clients' || o.store === 'proprietaires_fonciers'; });
    var n = await _fonPersonnesLier(src, 'pe1');
    return { n: n, client: DATA.clients[0].liens_personnes, prop: DATA.proprietaires_fonciers[0].liens_personnes && DATA.proprietaires_fonciers[0].liens_personnes.proprietaire, msg: T.join(' ') };
  }, stub.toString());
  assert.equal(r.n, 1); assert.deepEqual(r.client, {}); assert.equal(r.prop, 'pe1'); assert.match(r.msg, /droit insuffisant/);
});

test('journal : création, rapprochement, fusion, délier et code portail tracés sur la fiche', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    APP.currentUser = { nom: 'Resp Foncier' };
    window.ouvrirInvitation = function () {}; window.generateSalt = function () { return 's'; }; window.hashPassword = async function (c, s) { return 'h' + c + s; };
    DATA.personnes_fonciers = []; DATA.villages_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = []; DATA.clients = []; DATA.intervenants_fonciers = []; DATA.protocoles_purge_fonciers = [];
    DATA.af_operations = [{ id: 'o1', nom: 'OP', proprietaires: [{ id: '1', nom: 'AKA Paul', contact: '0102' }, { id: '2', nom: 'ODJE Clément' }] }];
    await fonPersonnesToutCreer();
    var P = DATA.personnes_fonciers.filter(function (x) { return /AKA/.test(x.nom); })[0], Q = DATA.personnes_fonciers.filter(function (x) { return /ODJE/.test(x.nom); })[0];
    await fonPersonnePortailGenerer(P.id);
    await fonPersonneDelier(P.id, 0);
    document.body.insertAdjacentHTML('beforeend', '<select id="fon-fusion-cible"><option value="' + P.id + '" selected>p</option></select>');
    await fonPersonneFusionner(Q.id);
    return { P: fonPersonneHistorique(P).map(function (h) { return h.txt.split(' — ')[0]; }), Q: fonPersonneHistorique(Q).map(function (h) { return h.txt.split(' — ')[0]; }), par: P.historique[0].par, html: fonPersonneFicheHtml(P) };
  }, stub.toString());
  assert.deepEqual(r.P.sort(), ['Code portail généré', 'Fiche absorbée', 'Fiche créée', 'Saisie déliée'].sort()); assert.deepEqual(r.Q.sort(), ['Fiche créée', 'Fusionnée'].sort());
  assert.equal(r.par, 'Resp Foncier'); assert.match(r.html, /Historique/); assert.match(r.html, /Code portail généré/);
});

test('performance : 700 personnes, rapprochement et aperçu en moins de 3 s', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    var pre = ['AKA', 'ANKON', 'ASSI', 'YAO', 'KOUASSI', 'MANDAH', 'LOBA', 'ODJE', 'GOUA', 'MONDON'], mid = ['PAUL', 'JEAN', 'MARIE', 'RAYMOND', 'ALAIN', 'JOSEPH', 'ODETTE', 'MARTIN'], suf = ['KOFFI', 'ABLE', 'AGRE', 'WEDJE', 'OWO', 'YAPO', 'AHOU', 'BAPOU', 'DIA', 'KRA'], noms = [];
    for (var i = 0; i < 700; i++) noms.push(pre[i % 10] + ' ' + suf[(i * 7) % 10] + ' ' + mid[(i * 3) % 8] + (i > 79 ? ' ' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i / 26) | 0) % 26) : ''));
    DATA.villages_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = []; DATA.intervenants_fonciers = []; DATA.protocoles_purge_fonciers = []; DATA.personnes_fonciers = [];
    DATA.af_operations = [{ id: 'o1', nom: 'OP', proprietaires: noms.slice(0, 250).map(function (n, i) { return { id: 'a' + i, nom: n }; }) }];
    DATA.clients = noms.slice(250, 700).map(function (n, i) { return { id: 'c' + i, nom: n.split(' ')[0], prenoms: n.split(' ').slice(1).join(' ') }; });
    var t = performance.now(), L = fonRapprochementApercu(); return { lignes: L.length, ms: Math.round(performance.now() - t) };
  }, stub.toString());
  assert.ok(r.lignes > 600); assert.ok(r.ms < 3000, 'trop lent : ' + r.ms + ' ms');
});
