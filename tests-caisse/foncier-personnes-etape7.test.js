/* Foncier L17 étape 7 — fiche personne, accès portail, propagation CNI/village/nature, souscripteurs et intervenants. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

const stub = () => {
  window.toast = function () {}; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
  window.syncToSupabase = function () {}; window.logAction = function () {}; window.fonRuralRender = function () {}; window.confirm = function () { return true; }; window.hasRole = function () { return true; };
};

test('souscripteurs et intervenants : reliés à la demande, jamais créés en masse par défaut, hors badge', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    DATA.personnes_fonciers = []; DATA.villages_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = [];
    DATA.af_operations = [{ id: 'o1', nom: 'OP', proprietaires: [{ id: '1', nom: 'AKA Paul' }] }];
    DATA.clients = [{ id: 'c1', nom: 'AKA', prenoms: 'Paul', tel: '0102' }, { id: 'c2', nom: 'ZADI', prenoms: 'Marc', tel: '0303' }];
    DATA.intervenants_fonciers = [{ id: 'i1', type: 'notaire', nom_organisation: 'Étude Koffi', telephone: '0505' }];
    var G = fonPersonnesGroupes(), o = { groupes: G.length, acteurSeul: G.filter(function (g) { return g.acteurSeul; }).length, badge: fonPersonnesNonRelieesNb() };
    await fonPersonnesToutCreer();
    o.apresBulk = DATA.personnes_fonciers.map(function (p) { return p.nom; }); o.clientLie1 = !!(DATA.clients[0].liens_personnes && DATA.clients[0].liens_personnes.nom); o.clientLie2 = !!(DATA.clients[1].liens_personnes && DATA.clients[1].liens_personnes.nom);
    await fonPersonnesToutCreer(true);
    o.apresActeurs = DATA.personnes_fonciers.length; o.clientLie2b = !!(DATA.clients[1].liens_personnes && DATA.clients[1].liens_personnes.nom); o.intervenantLie = !!(DATA.intervenants_fonciers[0].liens_personnes && DATA.intervenants_fonciers[0].liens_personnes.nom_organisation);
    o.nomClientIntact = DATA.clients[0].nom + '|' + DATA.clients[0].prenoms;
    return o;
  }, stub.toString());
  assert.equal(r.groupes, 3); assert.equal(r.acteurSeul, 2); assert.equal(r.badge, 1);
  assert.deepEqual(r.apresBulk, ['AKA Paul']); assert.equal(r.clientLie1, true); assert.equal(r.clientLie2, false);
  assert.equal(r.apresActeurs, 3); assert.equal(r.clientLie2b, true); assert.equal(r.intervenantLie, true); assert.equal(r.nomClientIntact, 'AKA|Paul');
});

test('propagation étendue : CNI, village, nature ; documents signés et souscripteurs intacts', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Kouamé Yao', nature: 'personne', cni: '', village_id: '' }];
    DATA.villages_fonciers = [{ id: 'v1', nom: 'Lahou' }]; DATA.parcelles = []; DATA.af_operations = []; DATA.intervenants_fonciers = [];
    DATA.proprietaires_fonciers = [{ id: 'r1', proprietaire: 'Kouamé Yao', type_proprietaire: 'personne', liens_personnes: { proprietaire: 'pe1' } }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', nom: 'Kouamé Yao', type: 'personne', village_id: '', liens_personnes: { nom: 'pe1' } }];
    DATA.protocoles_purge_fonciers = [{ id: 'pt1', statut: 'signe', chef_nom: 'Kouamé Yao', chef_cni: '', liens_personnes: { chef_nom: 'pe1' } }, { id: 'pt2', statut: 'brouillon', chef_nom: 'Kouamé Yao', chef_cni: '', liens_personnes: { chef_nom: 'pe1' } }];
    DATA.clients = [{ id: 'c1', nom: 'Kouamé', prenoms: 'Yao', liens_personnes: { nom: 'pe1' } }];
    var avant = JSON.parse(JSON.stringify(DATA.personnes_fonciers[0])), rec = Object.assign({}, avant, { cni: 'CI99', village_id: 'v1', nature: 'famille' }); DATA.personnes_fonciers[0] = rec;
    await fonPersonnePropager(rec, avant);
    return { cniBrouillon: DATA.protocoles_purge_fonciers[1].chef_cni, cniSigne: DATA.protocoles_purge_fonciers[0].chef_cni, village: DATA.ayants_droit_fonciers[0].village_id, natProp: DATA.proprietaires_fonciers[0].type_proprietaire, natAyant: DATA.ayants_droit_fonciers[0].type, client: DATA.clients[0].nom + '|' + DATA.clients[0].prenoms };
  }, stub.toString());
  assert.equal(r.cniBrouillon, 'CI99'); assert.equal(r.cniSigne, ''); assert.equal(r.village, 'v1'); assert.equal(r.natProp, 'famille'); assert.equal(r.natAyant, 'famille'); assert.equal(r.client, 'Kouamé|Yao');
});

test('fiche personne, fiche 360° de la parcelle et code portail depuis la fiche', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    var invites = []; window.ouvrirInvitation = function (o) { invites.push(o); }; window.generateSalt = function () { return 'salt' + Math.random(); }; window.hashPassword = async function (c, s) { return 'h:' + c + ':' + s; };
    DATA.personnes_fonciers = [{ id: 'pe1', reference: 'PER-1', nom: 'Aka Paul', nature: 'personne', contact: '0102' }, { id: 'pe2', reference: 'PER-2', nom: 'Sans Opération', nature: 'personne', contact: '0909' }];
    DATA.villages_fonciers = []; DATA.clients = []; DATA.intervenants_fonciers = [];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', localisation: 'Dabré' }];
    DATA.af_operations = [{ id: 'o1', nom: 'DABRE', parcelle_id: 'p1', proprietaires: [{ id: '1', nom: 'AKA Paul', liens_personnes: { nom: 'pe1' } }] }, { id: 'o2', nom: 'ANDOU', proprietaires: [{ id: '2', nom: 'Aka Paul', contact: '0102', liens_personnes: { nom: 'pe1' } }] }];
    DATA.proprietaires_fonciers = [{ id: 'r1', parcelle_id: 'p1', proprietaire: 'Aka Paul', quote_part: 100, liens_personnes: { proprietaire: 'pe1' } }]; DATA.ayants_droit_fonciers = [];
    var o = { html: fonPersonneFicheHtml(DATA.personnes_fonciers[0]), parcelles: fonPersonneParcelles('pe1').map(function (p) { return p.ref; }), p360: fonPersonnesDeParcelle('p1').map(function (x) { return x.p.nom + ':' + x.roles.sort().join('+'); }) };
    await fonPersonnePortailGenerer('pe1');
    var e1 = DATA.af_operations[0].proprietaires[0], e2 = DATA.af_operations[1].proprietaires[0];
    o.codes = [!!e1.code_acces_hash, !!e2.code_acces_hash, e1.code_acces_hash.split(':')[1] === e2.code_acces_hash.split(':')[1], e1.code_acces_hash !== e2.code_acces_hash]; o.contactPose = e1.contact; o.invites = invites.length; o.portail = fonPersonnePortail('pe1');
    await fonPersonnePortailGenerer('pe2'); o.refusSansOperation = invites.length === 1;
    return o;
  }, stub.toString());
  assert.match(r.html, /Parcelles concernées \(1\)/); assert.match(r.html, /P1/); assert.match(r.html, /Saisies reliées \(3\)/);
  assert.deepEqual(r.parcelles, ['P1']); assert.deepEqual(r.p360, ['Aka Paul:opération d\'acquisition+propriétaire']);
  assert.deepEqual(r.codes, [true, true, true, true]); assert.equal(r.contactPose, '0102'); assert.equal(r.invites, 1); assert.equal(r.portail, true); assert.equal(r.refusSansOperation, true);
});
