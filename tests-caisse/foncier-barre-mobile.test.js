/* Foncier — barre d'outils de la carte : libellés repliables (icônes seules sur mobile), réduction en un bouton. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
test('barre : libellé dans .ft-l, info-bulle conservée, réduction = un seul bouton, retour complet', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(() => {
    window.fcEstAdmin = function () { return false; }; var o = {}; FON_TER.barreMin = false;
    var h = fonTerritoireBarreHtml(); o.libelle = /<span class="ft-l"> Courbes<\/span>/.test(h); o.titre = /aria-label="Courbes de niveau/.test(h); o.min = /ft-min/.test(h);
    document.body.insertAdjacentHTML('beforeend', '<div id="fon-ter-barre"></div>'); fonTerritoireBarreMin();
    var el = document.getElementById('fon-ter-barre'); o.reduite = el.querySelectorAll('button').length; o.texte = /Outils/.test(el.innerHTML);
    fonTerritoireBarreMin(); o.rouverte = el.querySelectorAll('button').length > 8;
    o.css = /@media\(max-width:760px\)\{#fon-ter-barre\{flex-wrap:nowrap/.test(fonTerritoireCarteCadre());
    o.plein = /#fon-ter-mapwrap\{flex:1 1 0!important/.test(fonTerritoireCarteCadre()) && /#fon-ter-panneau\{flex:0 1 auto!important[^}]*max-height:34%/.test(fonTerritoireCarteCadre());
    return o;
  });
  assert.ok(r.libelle && r.titre && r.min && r.texte && r.rouverte && r.css && r.plein); assert.equal(r.reduite, 1);
});
