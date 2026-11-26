/* Foncier L11 — parcours guidé, fiche 360°, notes de calcul, interconnexions, navigation : le VRAI ERP (Chromium). */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.parcelles = [
      { id: 'r1', ref: 'R-1', regime: 'rural', superficie: 100000, prix_acq: 5000000, frais_notaire: 500000, localisation: 'Dabou', statut: 'prospection',
        bornes: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] },
      { id: 'r2', ref: 'R-2', regime: 'rural', superficie: 0, statut: 'prospection' }];
    DATA.ayants_droit_fonciers = [{ id: 'a1', nom: 'Famille K', parcelles: [{ parcelle_id: 'r1', part: 100 }] }];
    DATA.audits_fonciers = []; DATA.protocoles_purge_fonciers = []; DATA.enquetes_fonciers = []; DATA.oppositions_fonciers = [];
    DATA.bornages_fonciers = []; DATA.titres_fonciers = []; DATA.lots = []; DATA.programmes = []; DATA.pv_remises_fonciers = []; DATA.cessions_foncieres = [];
    DATA.proprietaires_fonciers = []; DATA.charges_fonciers = []; DATA.contrats_fonciers = []; DATA.exploitations_fonciers = []; DATA.dossiers_fonciers = [];
  });
}
const etats = (page, id) => page.evaluate(function (i) { var p = DATA.parcelles.filter(function (x) { return x.id === i; })[0]; var o = {}; fonParcoursParcelle(p).forEach(function (e) { o[e.id] = e.etat; }); return o; }, id);

test('parcours : 9 étapes, terre complète vs terre vide, blocage par opposition', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    assert.equal(await app.page.evaluate(() => FON_ETAPES.length), 9);
    const a = await etats(app.page, 'r1'), b = await etats(app.page, 'r2');
    assert.equal(a.identifier, 'fait'); assert.notEqual(b.identifier, 'fait');
    assert.equal(a.auditer, 'a_faire');
    await app.page.evaluate(() => { DATA.oppositions_fonciers = [{ id: 'o1', reference: 'OPP-1', parcelle_id: 'r1', opposant: 'X', motif: 'm', statut: 'ouverte' }]; });
    assert.equal((await etats(app.page, 'r1')).publicite, 'bloque');
    const nx = await app.page.evaluate(() => { var p = DATA.parcelles[0], e = fonParcoursParcelle(p); return fonParcoursSuivante(e).id + '|' + fonParcoursProgression(e); });
    assert.match(nx, /^auditer\|\d+$/);
    const af = await app.page.evaluate(() => fonParcoursAFaire(5).map(x => x.parcelle_id + ':' + x.etat));
    assert.equal(af[0], 'r1:bloque');
  } finally { await app.fermer(); }
});

test('audit GO débloque la purge ; protocole signé la fait avancer', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    await app.page.evaluate(() => {
      var pts = {}; FON_AUDIT_POINTS.forEach(function (d) { pts[d.code] = { statut: 'conforme' }; });
      DATA.audits_fonciers = [{ id: 'au1', reference: 'AUD-1', parcelle_id: 'r1', points: pts, decision: 'go' }];
    });
    assert.equal((await etats(app.page, 'r1')).auditer, 'fait');
    assert.equal((await etats(app.page, 'r1')).purger, 'a_faire');
    await app.page.evaluate(() => { DATA.protocoles_purge_fonciers = [{ id: 'pr1', reference: 'PRO-1', parcelle_id: 'r1', statut: 'signe', montant: 100 }]; });
    assert.equal((await etats(app.page, 'r1')).purger, 'en_cours');
    await app.page.evaluate(() => { DATA.protocoles_purge_fonciers[0].statut = 'reitere'; });
    assert.equal((await etats(app.page, 'r1')).purger, 'fait');
  } finally { await app.fermer(); }
});

test('fiche 360° : contenu et lien depuis les listes 2.6', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const h = await app.page.evaluate(() => fonFiche360Html(DATA.parcelles[0]));
    assert.match(h, /Avancement/); assert.match(h, /Famille K/); assert.match(h, /5[\s  ]?500[\s  ]?000/); assert.match(h, /10[\s  ]?ha|10 ha/);
    await app.page.evaluate(() => { DATA.oppositions_fonciers = [{ id: 'o1', reference: 'OPP-1', parcelle_id: 'r1', opposant: 'X', motif: 'm', statut: 'ouverte' }]; goTo('foncier'); switchTab('foncier', 'rural'); fonRuralVue('oppositions'); });
    assert.match(await app.page.evaluate(() => document.getElementById('fon-rural-liste').innerHTML), /fonFiche360\('r1'\)/);
    await app.page.evaluate(() => fonFiche360('r1'));
    assert.ok(await app.page.evaluate(() => document.getElementById('modal-fon-fiche').classList.contains('open')));
    assert.match(await app.page.evaluate(() => document.getElementById('fon-fiche-titre').textContent), /R-1/);
  } finally { await app.fermer(); }
});

test('notes : chaque onglet et chaque vue 2.6 a sa note complète ; liens valides', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(() => {
      var manque = [], vides = [], cibles = [];
      var tabs = Array.prototype.map.call(document.querySelectorAll('[id^="tab-foncier-"]'), function (e) { return e.id.replace('tab-foncier-', ''); }).filter(function (t) { return t !== 'rural' && t !== 'parcours' && t !== 'dashboard'; });
      tabs.forEach(function (t) { if (!FON_NOTES['tab:' + t]) manque.push('tab:' + t); });
      FON_ONGLETS.forEach(function (o) { if (!FON_NOTES['rural:' + o[0]]) manque.push('rural:' + o[0]); });
      if (!FON_NOTES['page:parcours']) manque.push('page:parcours');
      Object.keys(FON_NOTES).forEach(function (k) { var n = FON_NOTES[k]; if (!n.t || !n.but || !n.how.length) vides.push(k); });
      FON_LIENS.forEach(function (l) { cibles.push(l[3]); });
      var vuesOk = FON_ONGLETS.map(function (o) { return o[0]; }), mauvais = cibles.filter(function (c) { var p = c.split(':'); if (p[0] === 'rural') return vuesOk.indexOf(p[1]) === -1; if (p[0] === 'tab') return !document.getElementById('tab-foncier-' + p[1]); return false; });
      var nav = fonVuesOrdre(), doublons = nav.filter(function (v, i) { return nav.indexOf(v) !== i; }), absents = vuesOk.filter(function (v) { return nav.indexOf(v) === -1; });
      return { manque: manque, vides: vides, mauvais: mauvais, doublons: doublons, absents: absents };
    });
    assert.deepEqual(r.manque, []); assert.deepEqual(r.vides, []); assert.deepEqual(r.mauvais, []); assert.deepEqual(r.doublons, []); assert.deepEqual(r.absents, []);
  } finally { await app.fermer(); }
});

test('navigation : note injectée, bandeau d\'étape, parcours rendu, note complète imprimable', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(() => {
      goTo('foncier'); switchTab('foncier', 'rural'); fonRuralVue('enquetes');
      var o = { note: document.getElementById('fon-rural-note').innerHTML, ban: document.getElementById('fon-rural-banniere').innerHTML, nav: document.getElementById('fon-rural-nav').innerHTML };
      switchTab('foncier', 'cessions'); o.cess = (document.getElementById('fon-note-cessions') || {}).innerHTML || '';
      switchTab('foncier', 'parcours'); o.parc = document.getElementById('fon-parcours-root').innerHTML;
      o.tout = fonNotesToutesHtml();
      return o;
    });
    assert.match(r.note, /Note de calcul et mode d'emploi — Enquêtes/); assert.match(r.ban, /Étape 4 \/ 9/); assert.match(r.ban, /Bornages/);
    assert.match(r.nav, /Droits coutumiers/); assert.match(r.nav, /Remises/);
    assert.match(r.cess, /Marge de cession/); assert.match(r.parc, /À faire maintenant/); assert.match(r.parc, /R-1/);
    assert.match(r.tout, /Carte des interconnexions/); assert.match(r.tout, /Protocoles de purge/);
  } finally { await app.fermer(); }
});
