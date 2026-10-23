/* Documents scannés « allégés » : la synchro ne transporte que la fiche ; le fichier est téléchargé à l'ouverture,
   jamais effacé par une fiche, jamais renvoyé sans son contenu. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    SB.url = 'https://test.supabase.co'; SB.key = 'k';
    window.__idb = {}; window.__posts = []; window.__cloudBlob = {};
    window.dbGetAll = async function (s) { return Object.values(window.__idb[s] || {}); };
    window.dbPut = async function (s, o) { (window.__idb[s] = window.__idb[s] || {})[o.id] = o; return true; };
    window.toast = function () {};
    window.sbFetch = async function (path, method, body) {
      if (method === 'POST') { window.__posts.push({ path: path, body: body }); return []; }
      var m = /pi_documents\?id=eq\.([^&]+)&select=blob:data->>blob/.exec(path);
      if (m) { var b = window.__cloudBlob[decodeURIComponent(m[1])]; return b ? [{ blob: b }] : []; }
      return [];
    };
    window.__enLigne(true);
  });
}

test('réception : la fiche allégée est enregistrée sans fichier, et ne remplace jamais le fichier déjà présent sur le poste', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.documents = [];
      await dbPut('documents', { id: 'd1', entity_type: 'client', entity_id: 'c1', name: 'contrat.pdf', blob: 'data:application/pdf;base64,AAA', _modifie: '2026-10-01T10:00:00Z' });
      var rows = [
        { id: 'd1', updated_at: '2026-10-23T10:00:00Z', data: { id: 'd1', entity_type: 'client', entity_id: 'c1', name: 'contrat.pdf', description: 'modifié ailleurs', _modifie: '2026-10-23T10:00:00Z', _sans_contenu: true } },
        { id: 'd2', updated_at: '2026-10-23T10:05:00Z', data: { id: 'd2', entity_type: 'client', entity_id: 'c2', name: 'cni.pdf', _modifie: '2026-10-23T10:05:00Z', _sans_contenu: true } }];
      await _appliquerLignesPullTable('pi_documents', 'documents', rows);
      var d1 = window.__idb.documents.d1, d2 = window.__idb.documents.d2;
      return { d1blob: d1.blob, d1desc: d1.description, d1flag: !!d1._sans_contenu, d2blob: d2.blob || null, d2flag: !!d2._sans_contenu };
    });
    assert.equal(r.d1blob, 'data:application/pdf;base64,AAA', 'le fichier local est conservé');
    assert.equal(r.d1desc, 'modifié ailleurs', 'les métadonnées plus récentes sont appliquées');
    assert.equal(r.d1flag, false);
    assert.equal(r.d2blob, null); assert.equal(r.d2flag, true, 'fiche sans fichier, marquée allégée');
    assert.deepEqual(app.etat.erreursPage, []);
  } finally { await app.fermer(); }
});

test('ouverture : une fiche allégée télécharge son fichier, le garde, et ne le renvoie pas au cloud', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      window.__cloudBlob.d2 = 'data:application/pdf;base64,QkJC';
      await dbPut('documents', { id: 'd2', entity_type: 'client', entity_id: 'c2', name: 'cni.pdf', type: 'application/pdf', _sans_contenu: true });
      var ecrit = '';
      window.open = function () { return { document: { open: function () {}, write: function (h) { ecrit += h; }, close: function () {} }, close: function () {} }; };
      await apercuDocument('d2');
      var d = window.__idb.documents.d2;
      return { blob: d.blob, flag: !!d._sans_contenu, ecrit: ecrit, sale: !!_dirtySync['documents|d2'] };
    });
    assert.equal(r.blob, 'data:application/pdf;base64,QkJC');
    assert.equal(r.flag, false);
    assert.match(r.ecrit, /QkJC/);
    assert.equal(r.sale, false, 'simple mise en cache : rien à renvoyer au cloud');
  } finally { await app.fermer(); }
});

test('ouverture hors ligne ou fichier introuvable : message d\'erreur, aucune fenêtre vide laissée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      await dbPut('documents', { id: 'd3', entity_type: 'client', entity_id: 'c3', name: 'x.pdf', type: 'application/pdf', _sans_contenu: true });
      var fermee = false, msgs = [];
      window.toast = function (m) { msgs.push(m); };
      window.open = function () { return { document: { open: function () {}, write: function () {}, close: function () {} }, close: function () { fermee = true; } }; };
      await apercuDocument('d3');
      return { fermee: fermee, msg: msgs.join('|'), blob: window.__idb.documents.d3.blob || null };
    });
    assert.equal(r.fermee, true); assert.match(r.msg, /indisponible/); assert.equal(r.blob, null);
  } finally { await app.fermer(); }
});

test('envoi : une fiche allégée n\'est jamais envoyée sans son fichier (elle l\'effacerait côté cloud)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      var sync = window.__syncReel;
      var sansFichier = { id: 'd4', entity_type: 'client', entity_id: 'c4', name: 'a.pdf', _sans_contenu: true };
      var ok1 = await sync('pi_documents', sansFichier);
      var posts1 = window.__posts.length;
      window.__cloudBlob.d5 = 'data:application/pdf;base64,RERE';
      var avecFichierCloud = { id: 'd5', entity_type: 'client', entity_id: 'c5', name: 'b.pdf', _sans_contenu: true };
      var ok2 = await sync('pi_documents', avecFichierCloud);
      var post = window.__posts[window.__posts.length - 1];
      var lot = await syncToSupabaseBatch('pi_documents', [{ id: 'd6', _sans_contenu: true, name: 'c.pdf' }]);
      return { ok1: ok1, posts1: posts1, ok2: ok2, data: post && post.body && post.body.data, lotPosts: window.__posts.length - 1 };
    });
    assert.equal(r.ok1, false); assert.equal(r.posts1, 0, 'aucune requête d\'écriture sans fichier');
    assert.ok(r.data && r.data.blob === 'data:application/pdf;base64,RERE', 'envoi complet après récupération du fichier');
    assert.ok(!('_sans_contenu' in r.data), 'le marqueur d\'allègement ne part jamais au cloud');
    assert.equal(r.lotPosts, 0, 'jamais renvoyée en lot');
  } finally { await app.fermer(); }
});

test('récupération groupée : le poste demande les fiches allégées', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const corps = await app.page.evaluate(async function () {
      var vu = null;
      window.sbAuth = function () { return 'jwt'; };
      window.fetch = async function (url, opt) { if (/pull_incremental/.test(url)) vu = JSON.parse(opt.body); return { ok: true, json: async function () { return {}; } }; };
      try { await _pullBatchViaRPC(); } catch (e) {}
      return vu;
    });
    assert.equal(corps && corps.cursors && corps.cursors._docs_legers, 'oui');
  } finally { await app.fermer(); }
});

test('validation des attestations : les documents scannés du souscripteur sont listés avec un bouton d\'ouverture', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(function () {
      window.attSoldeSolde = function () { return { solde: true, prix: 1000, verse: 1000, dateSolde: '2026-01-01', vs: [] }; };
      var c = { id: 'c1', nom: 'BENDE', prenoms: 'X', dossier: 'D-1', attestation_solde: { numero: 'ATS-1' } };
      var avec = attSoldePiecesHtml(c, 'initial', [{ id: 'dx1', name: 'Contrat <réservation>.pdf', description: 'Contrat', upload_date: '2026-10-20', size: 5242880, visible_portail: true }]);
      var sans = attSoldePiecesHtml(c, 'initial', []);
      return { liste: /Documents scannés du souscripteur \(1\)/.test(avec), bouton: /apercuDocument\('dx1'\)/.test(avec), nom: /Contrat &lt;réservation&gt;\.pdf/.test(avec), taille: /5\.0 Mo/.test(avec), vide: /Aucun document scanné enregistré/.test(sans) };
    });
    assert.deepEqual(r, { liste: true, bouton: true, nom: true, taille: true, vide: true });
  } finally { await app.fermer(); }
});
