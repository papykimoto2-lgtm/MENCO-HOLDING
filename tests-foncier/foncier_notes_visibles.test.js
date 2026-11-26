/* Foncier — une note explicative visible sous chaque onglet : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

test('chaque vue du 2.6 affiche sa note explicative visible sous les onglets, sans rangée d\'onglets en double', async () => {
  const app = await ouvrirApp();
  try {
    await app.page.evaluate(() => { goTo('foncier'); switchTab('foncier', 'rural'); });
    const vues = await app.page.evaluate(() => FON_ONGLETS.map(o => o[0]));
    assert.ok(vues.length >= 15);
    for (const v of vues) {
      await app.page.evaluate(v => fonRuralVue(v), v);
      await app.page.waitForTimeout(250);   // certains écrans (terrain) se redessinent après un chargement asynchrone
      const r = await app.page.evaluate(v => ({ note: document.getElementById('fon-rural-note').innerHTML, onglets: document.getElementById('fon-rural-onglets').innerHTML, nav: document.getElementById('fon-rural-nav').innerHTML, but: FON_NOTES['rural:' + v].but, how0: FON_NOTES['rural:' + v].how[0] }), v);
      assert.match(r.note, /À quoi sert cet écran/, v); assert.ok(r.note.indexOf('class="fon-note-resume"') < r.note.indexOf('<details'), 'résumé avant le détail : ' + v);
      assert.ok(r.note.includes(r.but.replace(/&/g, '&amp;').replace(/'/g, '&#39;')) || r.note.includes(r.but), 'texte de la note : ' + v); assert.match(r.note, /Pour commencer/);
      assert.doesNotMatch(r.onglets, /fonRuralVue\(/, 'plus de rangée plate en double : ' + v);
      assert.equal((r.nav.match(new RegExp("fonRuralVue\\('" + v + "'\\)", 'g')) || []).length, 1, 'bouton unique dans la navigation : ' + v);
    }
  } finally { await app.fermer(); }
});

test('chaque onglet du Foncier, le Parcours et la Cohérence affichent le résumé', async () => {
  const app = await ouvrirApp();
  try {
    const r = await app.page.evaluate(async () => {
      goTo('foncier'); const manque = [];
      const tabs = Array.prototype.map.call(document.querySelectorAll('[id^="tab-foncier-"]'), e => e.id.replace('tab-foncier-', '')).filter(t => FON_NOTES['tab:' + t]);
      for (const t of tabs) { switchTab('foncier', t); const el = document.getElementById('fon-note-' + t); if (!el || !/À quoi sert cet écran/.test(el.innerHTML)) manque.push(t); }
      switchTab('foncier', 'parcours'); const parc = /À quoi sert cet écran/.test(document.getElementById('fon-parcours-root').innerHTML);
      switchTab('foncier', 'coherence'); await new Promise(r => setTimeout(r, 400)); const coh = /À quoi sert cet écran/.test(document.getElementById('fon-coherence-root').innerHTML);
      return { n: tabs.length, manque, parc, coh };
    });
    assert.ok(r.n >= 15); assert.deepEqual(r.manque, []); assert.equal(r.parc, true); assert.equal(r.coh, true);
  } finally { await app.fermer(); }
});
