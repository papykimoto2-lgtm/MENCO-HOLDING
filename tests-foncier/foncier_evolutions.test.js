/* Foncier — nouveau / ajusté mis en évidence dans Paramètres › Manuels & flux : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

test('flux : nouveaux en vert, ajustés en orange, existants sans marque', async () => {
  const app = await ouvrirApp();
  try {
    const r = await app.page.evaluate(() => {
      const mk = k => manuelsFluxHtml(MANUELS_FLUX[k]), cnt = (h, t) => (h.match(new RegExp(t, 'g')) || []).length;
      const nouveaux = Object.keys(MANUELS_FLUX).filter(k => MANUELS_FLUX[k].maj === 'nouveau'), ajustes = Object.keys(MANUELS_FLUX).filter(k => MANUELS_FLUX[k].maj === 'ajuste');
      return { nouveaux, ajustes, par: mk('fon_parcours'), parN: MANUELS_FLUX.fon_parcours.etapes.length, rural: mk('fon_rural'), ruralN: MANUELS_FLUX.fon_rural.etapes.length, dossier: mk('fon_dossier'), port: mk('fon_portefeuille'), af: mk('fon_af_porte'), recouv: mk('fon_recouvrement'),
        cnt: { par: cnt(mk('fon_parcours'), 'NOUVEAU'), rural: cnt(mk('fon_rural'), 'AJUSTÉ'), port: cnt(mk('fon_portefeuille'), 'AJUSTÉ'), af: cnt(mk('fon_af_porte'), 'AJUSTÉ'), dossier: cnt(mk('fon_dossier'), 'NOUVEAU|AJUSTÉ') },
        liens: MANUELS_NOUVEAUX.map(x => x[1]).concat(MANUELS_AJUSTEMENTS.map(x => x[3]).filter(Boolean)).filter(k => !MANUELS_FLUX[k]),
        evo: manuelsEvolutionHtml(), rows: Object.fromEntries(['PRO-FON', 'PRO-PTF', 'GUI-FON', 'GUI-FNC', 'PRO-CAI'].map(ref => [ref, manuelsEvoManuel(MANUELS_CATALOGUE.filter(m => m.ref === ref)[0])])) };
    });
    assert.deepEqual(r.nouveaux.sort(), ['fon_audit_purge', 'fon_coherence', 'fon_gestion', 'fon_import', 'fon_parcours', 'fon_publicite', 'fon_remise']);
    assert.deepEqual(r.ajustes.sort(), ['fon_af_porte', 'fon_portefeuille', 'fon_rural']);
    assert.equal(r.cnt.par, r.parN); assert.match(r.par, /#16a34a/);
    assert.equal(r.cnt.rural, 1); assert.equal(r.ruralN, 6); assert.match(r.rural, /#ea580c/); assert.match(r.rural, /Contrôle foncier rural/); assert.match(r.rural, /fon_controle_rural/);
    assert.equal(r.cnt.port, 2); assert.equal(r.cnt.af, 1); assert.equal(r.cnt.dossier, 0); assert.doesNotMatch(r.dossier, /#ea580c|#16a34a/); assert.doesNotMatch(r.recouv, /#ea580c|#16a34a/);
    assert.deepEqual(r.liens, []);
    assert.match(r.evo, /Aucune nouvelle procédure d'immatriculation/); assert.match(r.evo, /inchangée/); assert.match(r.evo, /Immatriculation rurale \(31 étapes\)/); assert.match(r.evo, /Parcours foncier/);
    assert.match(r.rows['PRO-FON'], /NOUVEAU/); assert.match(r.rows['PRO-FON'], /AJUSTÉ/); assert.match(r.rows['PRO-PTF'], /AJUSTÉ/); assert.doesNotMatch(r.rows['PRO-PTF'], /NOUVEAU/);
    assert.equal(r.rows['GUI-FON'], ''); assert.equal(r.rows['PRO-CAI'], ''); assert.match(r.rows['GUI-FNC'], /NOUVEAU/);
  } finally { await app.fermer(); }
});

test('écran Paramètres › Manuels : légende, pastilles dans la liste, diagrammes colorés', async () => {
  const app = await ouvrirApp();
  try {
    const r = await app.page.evaluate(() => {
      const p = document.getElementById('page-params') ? 'params' : 'parametres'; goTo(p); switchTab('params', 'manuels'); const liste = document.getElementById('manuels-liste').innerHTML;
      manuelsSelectionner('PRO-FON'); return { liste, flux: document.getElementById('manuels-flux').innerHTML };
    });
    assert.match(r.liste, /ce qui est nouveau, ce qui est ajusté/); assert.match(r.liste, /NOUVEAU/); assert.match(r.liste, /AJUSTÉ/);
    assert.match(r.flux, /Contrôle foncier rural/); assert.match(r.flux, /#ea580c/); assert.match(r.flux, /#16a34a/); assert.match(r.flux, /Parcours foncier/);
  } finally { await app.fermer(); }
});
