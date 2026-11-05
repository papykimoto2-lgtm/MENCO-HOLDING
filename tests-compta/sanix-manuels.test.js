const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

/* SANIX IA rattachée au manuel de procédures : choix des manuels, extraits, outil, mode local, liens PDF. */
const DOCS = path.resolve(__dirname, '..', 'docs');
const lire = (f) => fs.readFileSync(path.join(DOCS, f + '.md'), 'utf8');
async function charger(app, fichiers) {
  const textes = {}; fichiers.forEach((f) => { textes[f] = lire(f); });
  await app.page.evaluate(function (t) { Object.keys(t).forEach(function (f) { IAA_MAN_CACHE[f] = t[f]; }); }, textes);
}

test('choix du manuel : la question mène au bon manuel (référence, titre, module)', async () => {
  const app = await ouvrirApp();
  try {
    const r = await app.page.evaluate(function () {
      const q = function (t) { return iaaManuelsPertinents(t, 1).map(function (m) { return m.ref; })[0] || null; };
      return { vers: q('comment enregistrer un versement en espèces'), relance: q('comment faire une relance et une mise en demeure'), ref: q('que dit PRO-REL ?'), vague: q('bonjour ça va'),
        paie: q('comment comptabiliser la paie du mois'), caisse: q('clôturer la caisse en fin de journée') };
    });
    assert.equal(r.vers, 'PRO-PAI');
    assert.equal(r.relance, 'PRO-REL');
    assert.equal(r.ref, 'PRO-REL');
    assert.equal(r.vague, null);
    assert.equal(r.paie, 'PRO-PAIE');
    assert.match(String(r.caisse), /^PRO-/);
  } finally { await app.fermer(); }
});

test('extraits : la procédure demandée remonte (PAI-01 pour « enregistrer un versement »), dans la limite de taille', async () => {
  const app = await ouvrirApp();
  try {
    await charger(app, ['MANUEL_PAIEMENTS']);
    const r = await app.page.evaluate(async function () {
      const res = await iaaChercherProcedure('comment enregistrer un versement en espèces', '');
      return { refs: res.refs.map(function (m) { return m.ref; }), texte: res.texte };
    });
    assert.equal(r.refs[0], 'PRO-PAI');
    assert.match(r.texte, /PAI-01/);
    assert.match(r.texte, /MANUEL_PAIEMENTS\.pdf/);
    assert.ok(r.texte.length < 9000, 'longueur ' + r.texte.length);
  } finally { await app.fermer(); }
});

test('outils de l\'IA : rechercher_procedure et lister_manuels (exécutés par la boucle), outil inconnu inchangé', async () => {
  const app = await ouvrirApp();
  try {
    await charger(app, ['MANUEL_PAIEMENTS']);
    const r = await app.page.evaluate(async function () {
      const noms = IAA_TOOLS.map(function (t) { return t.name; });
      return { noms, proc: await iaaExecuterOutilAsync('rechercher_procedure', { requete: 'enregistrer un versement' }),
        precis: await iaaExecuterOutilAsync('rechercher_procedure', { requete: 'frais de souscription', ref: 'PRO-PAI' }),
        aucun: await iaaExecuterOutilAsync('rechercher_procedure', { requete: 'zzzz qqqq' }), liste: await iaaExecuterOutilAsync('lister_manuels', {}),
        ancien: await iaaExecuterOutilAsync('clients_impayes', {}) };
    });
    assert.ok(r.noms.indexOf('rechercher_procedure') !== -1 && r.noms.indexOf('lister_manuels') !== -1);
    assert.match(r.proc, /Manuel PRO-PAI/);
    assert.match(r.precis, /Manuel PRO-PAI/);
    assert.match(r.aucun, /n'invente pas/);
    assert.match(r.liste, /PRO-PAI — Paiements/);
    assert.equal(typeof r.ancien, 'string');
  } finally { await app.fermer(); }
});

test('consignes de l\'IA : la liste des manuels et la règle « consulter le manuel d\'abord » y figurent', async () => {
  const app = await ouvrirApp();
  try {
    const p = await app.page.evaluate(function () { return IAA_SYSTEM_PROMPT(); });
    assert.match(p, /rechercher_procedure/);
    assert.match(p, /- PRO-PAI · Paiements et échéanciers/);
    assert.match(p, /n'invente jamais une règle/);
  } finally { await app.fermer(); }
});

test('sans clé API : la réponse locale vient du manuel (extrait + référence), sinon repli sur le résumé des modules', async () => {
  const app = await ouvrirApp();
  try {
    await charger(app, ['MANUEL_PAIEMENTS']);
    const r = await app.page.evaluate(async function () {
      const rep = await iaaReponseManuelLocale('comment enregistrer un versement');
      const vide = await iaaReponseManuelLocale('bonjour ça va');
      IAA_MAN_CACHE = {};
      const horsLigne = await iaaReponseManuelLocale('comment faire une relance');   /* texte non téléchargeable ici (file://) */
      return { rep, vide, horsLigne };
    });
    assert.match(r.rep, /📖 Manuel PRO-PAI/);
    assert.match(r.rep, /PAI-01/);
    assert.equal(r.vide, null);
    assert.equal(r.horsLigne, null);
  } finally { await app.fermer(); }
});

test('affichage : les références PRO-xx deviennent des liens vers le PDF du manuel, sans ouvrir la porte au HTML', async () => {
  const app = await ouvrirApp();
  try {
    const html = await app.page.evaluate(function () {
      IAA.messages = [{ role: 'assistant', content: 'Voir PRO-PAI (PAI-01) et PRO-INCONNU <img src=x onerror="window.__x=1">' }];
      iaaRender();
      return document.getElementById('iaa-messages').innerHTML;
    });
    assert.match(html, /<a href="docs\/MANUEL_PAIEMENTS\.pdf"[^>]*>PRO-PAI<\/a>/);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, />PRO-INCONNU<\/a>/);
  } finally { await app.fermer(); }
});

test('recherche par sections de tous les manuels : « immatriculer une parcelle rurale » retrouve PRO-19, « changer la procédure » le guide foncier', async () => {
  const app = await ouvrirApp();
  try {
    const tous = fs.readdirSync(DOCS).filter((f) => /^MANUEL_.*\.md$/.test(f)).map((f) => f.slice(0, -3));
    await charger(app, tous);
    const r = await app.page.evaluate(async function () {
      const lire = async function (q) { const res = await iaaChercherProcedure(q, ''); return { refs: res.refs.map(function (m) { return m.ref; }), texte: res.texte }; };
      return { rurale: await lire('comment immatriculer une parcelle rurale'), docs: await lire('quels documents pour la procédure d\'immatriculation'),
        changer: await lire('comment changer la procédure d\'un dossier foncier'), cai: await lire('comment traiter un écart de caisse'), precis: await iaaChercherProcedure('frais', 'PRO-PAI') };
    });
    assert.equal(r.rurale.refs[0], 'PRO-FON');
    assert.match(r.rurale.texte, /PRO-19 — Immatriculer une parcelle rurale/);
    assert.equal(r.docs.refs[0], 'PRO-FON');
    assert.equal(r.changer.refs[0], 'GUI-FON');
    assert.match(r.changer.texte, /Changer la procédure d'un dossier ouvert/);
    assert.match(r.cai.texte, /CAI-12 — Traiter un écart de caisse/);
    assert.deepEqual(r.precis.refs.map(function (m) { return m.ref; }), ['PRO-PAI']);
    assert.ok(r.rurale.texte.length < 9500);
  } finally { await app.fermer(); }
});
