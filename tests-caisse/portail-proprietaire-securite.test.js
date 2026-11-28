/* Sécurité du portail propriétaire terrien : vue serveur sans fuite, échec fermé, session de l'ERP non falsifiable, limite d'essais. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright').chromium; }
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = process.env.CHROMIUM_PATH || (fs.existsSync(base) ? fs.readdirSync(base).filter(d => d.startsWith('chromium-')).sort().reverse().map(d => path.join(base, d, 'chrome-linux', 'chrome')).find(f => fs.existsSync(f)) : undefined);
const { ouvrirApp, fermerNavigateur } = require('./harness');
let nav; after(async () => { if (nav) await nav.close(); await fermerNavigateur(); });
async function ouvrirPortail() {
  nav = nav || await chromium.launch({ executablePath: exe });
  const page = await (await nav.newContext()).newPage(); const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.fulfill({ status: 200, body: '[]', contentType: 'application/json' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'portail-unique.html'));
  await page.waitForFunction(() => typeof loginPropFoncier === 'function' && typeof rendrePropFoncier === 'function');
  return { page, erreurs };
}
const VUE = { moi: { id: 'pr1', nom: 'KOUASSI Yao', qualite: 'Chef de terre', contact: '0102030405' }, sites: [
  { id: 'op1', nom: 'Site Ahoué', village: 'Ahoué', commune: 'Bingerville', departement: 'Abidjan', superficie: 120000, stage: 'amenagement', nb_lots: 200, cle_prop: 20,
    accord_principe: true, verif_droits: true, juridique_valide: false, avancement: 45, postes: [{ poste: 'Voirie <b>x</b>', avancement: 60 }, { poste: 'Eau', avancement: 30 }],
    demarches: [{ libelle: 'Arrêté de lotir', statut: 'en cours', date: '2026-05-01' }] }] };

test('portail : le propriétaire charge sa vue par RPC (sans paramètre), jamais la table des opérations ; rendu sans budget ; texte échappé', async () => {
  const { page, erreurs } = await ouvrirPortail();
  const r = await page.evaluate(async (V) => {
    var o = {}, urls = [], b64 = function (x) { return btoa(JSON.stringify(x)).replace(/=+$/, ''); }, JETON = b64({ alg: 'HS256' }) + '.' + b64({ exp: Math.floor(Date.now() / 1000) + 3600, kind: 'proprio_foncier' }) + '.sig';
    document.getElementById('pfLogin').value = '0102030405'; document.getElementById('pfCode').value = '123456';
    window.fetch = async function (u, opt) {
      u = String(u); urls.push(u);
      if (/portal-login/.test(u)) return new Response(JSON.stringify({ access_token: JETON, kind: 'proprio_foncier', id: 'pr1', prop_id: 'pr1' }), { status: 200 });
      if (/rpc\/fc_vue_proprietaire/.test(u)) { o.corps = opt && opt.body; o.auth = opt && opt.headers && opt.headers.Authorization; return new Response(JSON.stringify(V), { status: 200 }); }
      return new Response('[]', { status: 200 });
    };
    await loginPropFoncier();
    o.rpc = urls.some(function (u) { return /rpc\/fc_vue_proprietaire/.test(u); }); o.table = urls.some(function (u) { return /pi_af_operations/.test(u); });
    var h = document.getElementById('propfonc-dash').innerHTML; o.h = h; o.visible = document.getElementById('propfonc-dash').style.display === 'block';
    return o;
  }, VUE);
  assert.equal(r.rpc, true); assert.equal(r.table, false); assert.equal(r.corps, '{}'); assert.match(r.auth, /^Bearer [^.]+\.[^.]+\.sig$/); assert.equal(r.visible, true);
  assert.match(r.h, /Site Ahoué/); assert.match(r.h, /45 %/); assert.match(r.h, /Arrêté de lotir/); assert.match(r.h, /Voirie &lt;b&gt;x&lt;\/b&gt;/); assert.doesNotMatch(r.h, /<b>x<\/b>/);
  assert.match(r.h, /40/);   /* 200 lots × 20 % = 40 */
  assert.deepEqual(erreurs, []);
});

test('portail : échec fermé — fonction indisponible ou réponse invalide : aucun accès, aucun repli sur la table, compteur d\'essais intact pour une panne', async () => {
  const { page, erreurs } = await ouvrirPortail();
  const r = await page.evaluate(async () => {
    var o = {}, urls = [], mode = 'panne';
    document.getElementById('pfLogin').value = '0102030405'; document.getElementById('pfCode').value = '123456';
    window.fetch = async function (u) {
      u = String(u); urls.push(u);
      if (/portal-login/.test(u)) return new Response(JSON.stringify({ access_token: 'JETON', kind: 'proprio_foncier', id: 'pr1' }), { status: 200 });
      if (/rpc\/fc_vue_proprietaire/.test(u)) return mode === 'panne' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ moi: null, sites: [] }), { status: 200 });
      return new Response('[]', { status: 200 });
    };
    try { localStorage.removeItem('pf_bf'); } catch (e) {}
    await loginPropFoncier(); o.panneAcces = document.getElementById('propfonc-dash').style.display; o.panneMsg = document.getElementById('pfError').textContent; o.panneCompteur = localStorage.getItem('pf_bf');
    mode = 'vide'; await loginPropFoncier(); o.videAcces = document.getElementById('propfonc-dash').style.display; o.videCompteur = Object.keys(JSON.parse(localStorage.getItem('pf_bf') || '{}')).length;
    o.table = urls.some(function (u) { return /pi_af_operations/.test(u); }); o.jeton = (function () { try { return sessionStorage.getItem('pp_token'); } catch (e) { return 'x'; } })();
    return o;
  });
  assert.notEqual(r.panneAcces, 'block'); assert.match(r.panneMsg, /indisponible/); assert.ok(!r.panneCompteur || r.panneCompteur === '{}'); assert.notEqual(r.videAcces, 'block'); assert.equal(r.videCompteur, 1); assert.equal(r.table, false);
  assert.deepEqual(erreurs, []);
});

test('ERP : session du portail propriétaire non falsifiable (contact seul refusé, preuve exigée, durée limitée, code régénéré = session coupée), limite d\'essais', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var o = {}, salt = 'abc', hash = await hashPassword('123456', salt);
    window.toast = function () {}; window.logConnexion = async function () {}; window.dbPut = async function () {}; window.syncToSupabase = function () {};
    DATA.af_operations = [{ id: 'op1', nom: 'Site', proprietaires: [{ id: 'p1', nom: 'KOUASSI', contact: '0102030405', code_acces_hash: hash, code_acces_salt: salt }] }];
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('propfonc_session', JSON.stringify({ contact: '0102030405' })); SESSION_PROPFONC = null;
    o.contactSeul = verifierSessionPropFonc(); o.ancienEfface = localStorage.getItem('propfonc_session') === null;
    sessionStorage.setItem('propfonc_session', JSON.stringify({ contact: '0102030405', p: 'forge', t: Date.now() })); o.preuveFausse = verifierSessionPropFonc();
    document.getElementById('pf-login').value = '0102030405'; document.getElementById('pf-password').value = '123456'; var e = document.getElementById('pf-login-error');
    window.goToPortailPropFonc = function () {}; window.closeModal = function () {};
    await authentifierProprietaireFoncier(); o.connecte = !!SESSION_PROPFONC; o.stocke = sessionStorage.getItem('propfonc_session') !== null && localStorage.getItem('propfonc_session') === null;
    SESSION_PROPFONC = null; o.reprise = verifierSessionPropFonc();
    var s = JSON.parse(sessionStorage.getItem('propfonc_session')); s.t = Date.now() - 9 * 3600 * 1000; sessionStorage.setItem('propfonc_session', JSON.stringify(s)); SESSION_PROPFONC = null; o.expiree = verifierSessionPropFonc();
    await authentifierProprietaireFoncier(); SESSION_PROPFONC = null; DATA.af_operations[0].proprietaires[0].code_acces_hash = 'nouveau-hash-regenere'; o.codeRegenere = verifierSessionPropFonc();
    DATA.af_operations[0].proprietaires[0].code_acces_hash = hash; localStorage.clear(); sessionStorage.clear(); SESSION_PROPFONC = null;
    document.getElementById('pf-password').value = '000000'; for (var i = 0; i < 5; i++) await authentifierProprietaireFoncier();
    document.getElementById('pf-password').value = '123456'; await authentifierProprietaireFoncier(); o.bloque = !SESSION_PROPFONC && /Trop de tentatives/.test(e.textContent);
    return o;
  });
  assert.equal(r.contactSeul, false); assert.equal(r.ancienEfface, true); assert.equal(r.preuveFausse, false); assert.equal(r.connecte, true); assert.equal(r.stocke, true); assert.equal(r.reprise, true);
  assert.equal(r.expiree, false); assert.equal(r.codeRegenere, false); assert.equal(r.bloque, true);
});

test('SQL fc_vue_proprietaire : identité dans le jeton, aucun paramètre, droits réduits, aucune donnée sensible renvoyée', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'foncier_portail_proprietaire.sql'), 'utf8');
  const code = sql.split('-- ── Retour arrière')[0];
  assert.match(code, /create or replace function public\.fc_vue_proprietaire\(\)/); assert.match(code, /security definer/); assert.match(code, /set search_path = ''/);
  assert.match(code, /auth\.jwt\(\) ->> 'kind'.*<> 'proprio_foncier'/); assert.match(code, /auth\.jwt\(\) ->> 'prop_id'/);
  assert.match(code, /revoke all on function public\.fc_vue_proprietaire\(\) from public, anon/); assert.match(code, /grant execute on function public\.fc_vue_proprietaire\(\) to authenticated/);
  const sortie = code.slice(code.indexOf("'id',          o.id"), code.indexOf(') as site'));
  for (const interdit of ['code_acces', 'salt', 'hash', 'cni', 'prix', 'financ', 'observations']) assert.ok(!sortie.includes(interdit), 'clé sensible dans la sortie : ' + interdit);
  assert.doesNotMatch(sortie, /'budget'\s*,/);   /* le budget sert au calcul, jamais renvoyé */
  assert.doesNotMatch(code, /select[^;]*\binto\b\s+v_/i);   /* « select into » interdit dans le tableau de bord Supabase */
  assert.match(code, /drop policy if exists portail_operations/); assert.doesNotMatch(code.slice(code.indexOf('create policy portail_operations')), /proprio_dans/);
});
