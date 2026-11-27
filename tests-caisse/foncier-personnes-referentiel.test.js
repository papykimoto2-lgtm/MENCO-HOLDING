/* Foncier L17 — référentiel unique des personnes : regroupement des doublons, création + liens, fusion. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('rapprochement : un groupe par personne, liens ajoutés sans toucher aux anciens champs, fusion', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var o = {};
    window.toast = function () {}; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
    window.syncToSupabase = function () {}; window.logAction = function () {}; window._fonJournal = async function () {}; window.fonRuralRender = function () {}; window.fonRapprochementOuvrir = function () {};
    DATA.personnes_fonciers = []; DATA.villages_fonciers = [{ id: 'v1', nom: 'Lahou', chef: 'Kouamé Yao', chef_tel: '07' }];
    DATA.af_operations = [{ id: 'op1', nom: 'Op1', proprietaires: [{ id: 'x', nom: 'KOUASSI Jean', contact: '0102' }] }];
    DATA.proprietaires_fonciers = [{ id: 'pr1', reference: 'PRO-1', proprietaire: 'Jean Kouassi', type_proprietaire: 'personne' }, { id: 'pr2', reference: 'PRO-2', proprietaire: 'Famille Bédié', type_proprietaire: 'famille' }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', reference: 'AYD-1', nom: 'Famille Bédié', type: 'famille', village_id: 'v1' }];
    DATA.protocoles_purge_fonciers = [{ id: 'pt1', reference: 'PRT-1', famille: 'Famille Bédié', chef_nom: 'Kouamé  Yao' }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', vendeur: 'Jean  Kouassi', cedant: 'ÉTAT-CI' }];
    var G = fonPersonnesGroupes();
    o.groupes = G.length; var k = G.filter(function (g) { return g.cle === fonNormNom('Jean Kouassi'); })[0]; o.kouassiSaisies = k && k.sources.length;
    o.bedie = (G.filter(function (g) { return g.cle === fonNormNom('Famille Bédié'); })[0] || {}).sources.length;
    var n = 0; var cles = G.map(function (g) { return g.cle; });
    for (var i = 0; i < cles.length; i++) n += await fonPersonnesCreerEtLier(cles[i]);
    o.liens = n; o.personnes = DATA.personnes_fonciers.length; o.apresGroupes = fonPersonnesGroupes().length;
    o.ancienChamp = DATA.proprietaires_fonciers[0].proprietaire; o.lienAf = DATA.af_operations[0].proprietaires[0].liens_personnes.nom === DATA.proprietaires_fonciers[0].liens_personnes.proprietaire;
    /* fusion : deux fiches pour la même famille créées à la main */
    var a = DATA.personnes_fonciers.filter(function (x) { return /Bédié/.test(x.nom); })[0], b = { id: 'dup', reference: 'PER-X', nom: 'Bedie famille', nature: 'famille' }; DATA.personnes_fonciers.push(b);
    document.body.insertAdjacentHTML('beforeend', '<select id="fon-fusion-cible"><option value="' + a.id + '" selected>a</option></select>');
    await _fonPersonnesLier([DATA.ayants_droit_fonciers[0]].map(function () { return fonPersonnesSources().filter(function (s) { return s.store === 'ayants_droit_fonciers'; })[0]; }), 'dup');
    await fonPersonneFusionner('dup');
    o.fusionnee = b.fusionnee_dans === a.id; o.ayantVersCible = DATA.ayants_droit_fonciers[0].liens_personnes.nom === a.id;
    return o;
  });
  assert.equal(r.kouassiSaisies, 3); assert.equal(r.bedie, 3);
  assert.equal(r.groupes, 4);   /* Kouassi, Bédié, Kouamé Yao, État-CI */
  assert.equal(r.apresGroupes, 0); assert.equal(r.ancienChamp, 'Jean Kouassi'); assert.equal(r.lienAf, true);
  assert.equal(r.fusionnee, true); assert.equal(r.ayantVersCible, true);
});

test('nom court sur plusieurs sites : homonymes possibles, exclu du « Tout créer » ; nom complet multi-sites : groupé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    window.toast = function () {}; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
    window.syncToSupabase = function () {}; window.logAction = function () {}; window._fonJournal = async function () {}; window.fonRuralRender = function () {}; window.fonRapprochementOuvrir = function () {};
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = []; DATA.villages_fonciers = [];
    DATA.af_operations = [
      { id: 'o1', nom: 'DABRE', proprietaires: [{ id: '1', nom: 'AKA BEDJE' }, { id: '2', nom: 'ANKON WEDJE SYLVAIN' }, { id: '3', nom: 'DJINDJI AKISSI' }] },
      { id: 'o2', nom: 'ANDOU', proprietaires: [{ id: '4', nom: 'AKA BEDJE ' }, { id: '5', nom: 'ANKON WEDJE SYLVAIN ' }, { id: '6', nom: 'DINDJI AKISSI' }] }];
    var G = fonPersonnesGroupes(), par = function (n) { return G.filter(function (g) { return g.cle === fonNormNom(n); })[0]; };
    var o = { court: par('AKA BEDJE').homonymes, complet: par('ANKON WEDJE SYLVAIN').homonymes, proche: par('DJINDJI AKISSI').proches.length };
    await fonPersonnesToutCreer(); o.personnes = DATA.personnes_fonciers.map(function (p) { return p.nom; });
    return o;
  });
  assert.equal(r.court, true); assert.equal(r.complet, false); assert.equal(r.proche, 1);
  assert.deepEqual(r.personnes, ['ANKON WEDJE SYLVAIN']);
});

test('délier : lien retiré, pas reproposé à la même fiche, nouvelle fiche possible, lien conservé à la ré-enregistrement', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    window.toast = function () {}; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
    window.syncToSupabase = function () {}; window.logAction = function () {}; window._fonJournal = async function () {}; window.fonRuralRender = function () {}; window.confirm = function () { return true; };
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = []; DATA.villages_fonciers = [];
    DATA.af_operations = [{ id: 'o1', nom: 'DABRE', proprietaires: [{ id: '1', nom: 'AKA BEDJE Paul' }] }, { id: 'o2', nom: 'ANDOU', proprietaires: [{ id: '2', nom: 'AKA BEDJE Paul' }] }];
    await fonPersonnesToutCreer();
    var P = DATA.personnes_fonciers[0], o = { creees: DATA.personnes_fonciers.length, liens: fonPersonneLiens(P.id).length };
    var idx = fonPersonneLiens(P.id).findIndex(function (x) { return x.parent.id === 'o2'; });
    await fonPersonneDelier(P.id, idx);
    o.apresDelier = fonPersonneLiens(P.id).length; o.lienRetire = !DATA.af_operations[1].proprietaires[0].liens_personnes.nom;
    var G = fonPersonnesGroupes(); o.groupes = G.length; o.personneProposee = G[0] && G[0].personne;   /* ne doit pas reproposer P */
    await fonPersonnesCreerEtLier(G[0].cle);
    o.personnes = DATA.personnes_fonciers.length; var Q = DATA.personnes_fonciers[1];
    o.nouveauLien = DATA.af_operations[1].proprietaires[0].liens_personnes.nom === Q.id;
    /* ré-enregistrement de l'opération : les deux liens (même nom, deux fiches) sont conservés */
    await fonPersonneAssurer(DATA.af_operations[1].proprietaires[0], 'nom', 'personne'); await fonPersonneAssurer(DATA.af_operations[0].proprietaires[0], 'nom', 'personne');
    o.stable = DATA.af_operations[1].proprietaires[0].liens_personnes.nom === Q.id && DATA.af_operations[0].proprietaires[0].liens_personnes.nom === P.id && DATA.personnes_fonciers.length === 2;
    return o;
  });
  assert.equal(r.creees, 1); assert.equal(r.liens, 2); assert.equal(r.apresDelier, 1); assert.equal(r.lienRetire, true);
  assert.equal(r.groupes, 1); assert.equal(r.personneProposee, null); assert.equal(r.personnes, 2); assert.equal(r.nouveauLien, true); assert.equal(r.stable, true);
});

test('aperçu de la migration : une ligne par groupe, aucune écriture, traitement en masse annoncé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    window.toast = function () {}; window.userPeutSurStore = function () { return true; }; var ecritures = 0; window.fcDb = async function () { ecritures++; return true; }; window.dbPut = async function () { ecritures++; return true; };
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = []; DATA.villages_fonciers = [];
    DATA.af_operations = [
      { id: 'o1', nom: 'DABRE', proprietaires: [{ id: '1', nom: 'AKA BEDJE' }, { id: '2', nom: 'ANKON WEDJE SYLVAIN' }, { id: '3', nom: 'DJINDJI AKISSI' }] },
      { id: 'o2', nom: 'ANDOU', proprietaires: [{ id: '4', nom: 'AKA BEDJE ' }, { id: '5', nom: 'ANKON WEDJE SYLVAIN ' }, { id: '6', nom: 'DINDJI AKISSI' }] }];
    var L = fonRapprochementApercu(); return { lignes: L.length, traites: L.filter(function (l) { return l[8] === 'oui'; }).map(function (l) { return l[0]; }), ecritures: ecritures };
  });
  assert.equal(r.lignes, 4); assert.deepEqual(r.traites, ['ANKON WEDJE SYLVAIN']); assert.equal(r.ecritures, 0);
});

test('données réelles : État, collectivité et famille traités comme entités uniques ; quasi-doublons longs signalés', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.villages_fonciers = [];
    DATA.af_operations = [
      { id: 'o1', nom: 'A', proprietaires: [{ id: '1', nom: 'FAMILLE OGBOTOU' }, { id: '2', nom: 'ADICO PAUL' }, { id: '3', nom: 'DAGNAN ASSI PAUL' }, { id: '4', nom: 'KPANGBA KACOU MARTIN' }] },
      { id: 'o2', nom: 'B', proprietaires: [{ id: '5', nom: 'FAMILLE OGBOTOU' }, { id: '6', nom: 'ADICO PAUL' }, { id: '7', nom: 'DAGNISSAN ASSI PAUL' }, { id: '8', nom: 'KPANGBA KOUAKOU MARTIN' }] }];
    DATA.parcelles = [{ id: 'p1', ref: 'P1', cedant: 'ETAT-CI' }, { id: 'p2', ref: 'P2', cedant: 'ETAT CI' }, { id: 'p3', ref: 'P3', vendeur: 'COMMUNAUTE VILLAGEOISE' }];
    var G = fonPersonnesGroupes(), par = function (c) { return G.filter(function (g) { return g.cle === fonNormNom(c); })[0]; };
    return { etat: [par('ETAT-CI').nature, par('ETAT-CI').homonymes, par('ETAT-CI').sources.length], coll: par('COMMUNAUTE VILLAGEOISE').nature, fam: [par('FAMILLE OGBOTOU').nature, par('FAMILLE OGBOTOU').homonymes],
      adico: par('ADICO PAUL').homonymes, dag: par('DAGNAN ASSI PAUL').proches.length, kp: par('KPANGBA KACOU MARTIN').proches.length };
  });
  assert.deepEqual(r.etat, ['etat', false, 2]); assert.equal(r.coll, 'collectivite'); assert.deepEqual(r.fam, ['famille', false]); assert.equal(r.adico, true); assert.equal(r.dag, 1); assert.equal(r.kp, 1);
});
