/* Foncier L17 étape 2 — saisie assistée : lien automatique, création au besoin, pas de doublon dans le référentiel. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('les formulaires relient ou créent la personne au référentiel', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var o = {}, T = [];
    window.toast = function (m) { T.push(m); }; window.fcDroitEcriture = function () { return true; }; window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; };
    window.syncToSupabase = function () {}; window.logAction = function () {}; window._fonJournal = async function () {}; window.fonRuralRender = function () {};
    window.fonDroitsPreparer = function () { return ''; }; window.fonDroitsValider = function () { return ''; }; window.fonRuralTracerModif = function () { return true; };
    DATA.personnes_fonciers = []; DATA.proprietaires_fonciers = []; DATA.ayants_droit_fonciers = []; DATA.parcelles = [{ id: 'p1', ref: 'P1' }];
    /* 1. nouveau propriétaire inconnu → fiche créée + liée */
    fonRuralOuvrir('proprietaires', null);
    o.liste = document.getElementById('fonr-proprietaire').getAttribute('list');
    document.getElementById('fonr-parcelle_id').value = 'p1'; document.getElementById('fonr-proprietaire').value = 'Jean KOUASSI';
    await fonRuralEnregistrer();
    o.apres1 = DATA.personnes_fonciers.length; var pr = DATA.proprietaires_fonciers[0]; o.lie1 = pr && pr.liens_personnes && pr.liens_personnes.proprietaire === DATA.personnes_fonciers[0].id;
    /* 2. ayant droit avec le même nom (casse et ordre différents) → même personne, aucune création */
    fonRuralOuvrir('ayants_droit', null); document.getElementById('fonr-nom').value = 'kouassi jean'; await fonRuralEnregistrer();
    o.apres2 = DATA.personnes_fonciers.length; o.memeId = DATA.ayants_droit_fonciers[0].liens_personnes.nom === DATA.personnes_fonciers[0].id;
    /* 3. création manuelle d'un doublon refusée */
    fonRuralOuvrir('personnes', null); document.getElementById('fonr-nom').value = 'Jean Kouassi'; T.length = 0; await fonRuralEnregistrer();
    o.apres3 = DATA.personnes_fonciers.length; o.refus = /existe déjà/.test(T.join(' '));
    /* 4. liste de saisie alimentée */
    fonPersonnesDatalistMaj(); o.options = document.getElementById('fon-pers-list').options.length;
    return o;
  });
  assert.equal(r.liste, 'fon-pers-list'); assert.equal(r.apres1, 1); assert.equal(r.lie1, true);
  assert.equal(r.apres2, 1); assert.equal(r.memeId, true); assert.equal(r.apres3, 1); assert.equal(r.refus, true); assert.equal(r.options, 1);
});
