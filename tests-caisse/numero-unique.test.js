const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

/* Index uq_pi_caisse_mouvements_numero : si la base refuse un bon parce qu'un autre poste a pris son numéro,
   l'application prend le numéro suivant et renvoie, au lieu de laisser le bon en quarantaine sur ce seul poste. */
async function amorcer(page, opts) {
  await page.evaluate(function (opts) {
    Object.defineProperty(navigator, 'onLine', { get: function () { return opts.enLigne !== false; }, configurable: true });
    DATA.caisses = [{ id: 'c1', nom: 'CAISSE 1', compte: '571' }];
    window.__msgs = []; window.toast = function (m) { window.__msgs.push(String(m)); };
    window.__envois = [];
    var pris = opts.numerosPris || [];          /* numéros déjà présents dans le cloud, sous un autre identifiant */
    window.sbFetch = async function (path) {
      if (/numero=eq\./.test(path)) {
        var n = decodeURIComponent(path.split('numero=eq.')[1].split('&')[0]);
        return pris.indexOf(n) >= 0 ? [{ id: 'autre-poste' }] : [];
      }
      /* maximum cloud pour caisseProchainNumero */
      var max = pris.slice().sort().pop();
      return max ? [{ numero: max }] : [];
    };
    window.syncToSupabase = async function (table, obj) {
      window.__envois.push(obj.numero);
      return pris.indexOf(obj.numero) >= 0 ? false : true;   /* l'index refuse un numéro déjà pris */
    };
    window.__mvt = { id: 'm1', caisse_id: 'c1', type: 'entree', montant: 1000, date: '2026-11-03T10:00:00', numero: 'BE-571-20261103-001' };
  }, opts);
}

test('numéro déjà pris par un autre poste : le bon prend le numéro suivant et est envoyé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { numerosPris: ['BE-571-20261103-001'] });
    const r = await app.page.evaluate(async function () {
      DATA.caisse_mouvements = [window.__mvt];
      var ok = await window.__caisseSyncReel('pi_caisse_mouvements', window.__mvt);
      return { ok: ok, numero: window.__mvt.numero, precedent: window.__mvt.numero_precedent, envois: window.__envois, msgs: window.__msgs };
    });
    assert.equal(r.ok, true);
    assert.equal(r.numero, 'BE-571-20261103-002');
    assert.equal(r.precedent, 'BE-571-20261103-001');
    assert.deepEqual(r.envois, ['BE-571-20261103-001', 'BE-571-20261103-002']);
    assert.ok(r.msgs.some(function (m) { return /venait d'être pris par un autre poste/.test(m); }), JSON.stringify(r.msgs));
  } finally { await app.fermer(); }
});

test('plusieurs numéros pris à la suite : le bon avance jusqu\'au premier libre', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { numerosPris: ['BE-571-20261103-001', 'BE-571-20261103-002'] });
    const r = await app.page.evaluate(async function () {
      DATA.caisse_mouvements = [window.__mvt];
      var ok = await window.__caisseSyncReel('pi_caisse_mouvements', window.__mvt);
      return { ok: ok, numero: window.__mvt.numero };
    });
    assert.equal(r.ok, true); assert.equal(r.numero, 'BE-571-20261103-003');
  } finally { await app.fermer(); }
});

test('refus qui n\'est pas un conflit de numéro : le bon n\'est pas renuméroté', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { numerosPris: [] });
    const r = await app.page.evaluate(async function () {
      window.syncToSupabase = async function (t, o) { window.__envois.push(o.numero); return false; };   /* échec sans rapport avec le numéro */
      DATA.caisse_mouvements = [window.__mvt];
      var ok = await window.__caisseSyncReel('pi_caisse_mouvements', window.__mvt);
      return { ok: ok, numero: window.__mvt.numero, precedent: window.__mvt.numero_precedent || null, envois: window.__envois.length };
    });
    assert.equal(r.ok, false); assert.equal(r.numero, 'BE-571-20261103-001'); assert.equal(r.precedent, null); assert.equal(r.envois, 1);
  } finally { await app.fermer(); }
});

test('hors ligne : aucune tentative de renumérotation', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { numerosPris: ['BE-571-20261103-001'], enLigne: false });
    const r = await app.page.evaluate(async function () {
      DATA.caisse_mouvements = [window.__mvt];
      var ok = await window.__caisseSyncReel('pi_caisse_mouvements', window.__mvt);
      return { ok: ok, numero: window.__mvt.numero };
    });
    assert.equal(r.ok, false); assert.equal(r.numero, 'BE-571-20261103-001');
  } finally { await app.fermer(); }
});

test('autres tables : aucun effet', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { numerosPris: ['BE-571-20261103-001'] });
    const r = await app.page.evaluate(async function () {
      window.syncToSupabase = async function () { return false; };
      var ok = await window.__caisseSyncReel('pi_caisse_sessions', { id: 's1', numero: 'BE-571-20261103-001', caisse_id: 'c1' });
      return { ok: ok };
    });
    assert.equal(r.ok, false);
  } finally { await app.fermer(); }
});
