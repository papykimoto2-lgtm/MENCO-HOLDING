/* Plan d'ensemble (plan directeur) : publication par la direction, copie figée, mentions juridiques, image raster réduite, portail souscripteur. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright').chromium; }
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = process.env.CHROMIUM_PATH || (fs.existsSync(base) ? fs.readdirSync(base).filter(d => d.startsWith('chromium-')).sort().reverse().map(d => path.join(base, d, 'chrome-linux', 'chrome')).find(f => fs.existsSync(f)) : undefined);
const { ouvrirApp, fermerNavigateur } = require('./harness');
let nav; after(async () => { if (nav) await nav.close(); await fermerNavigateur(); });
const stub = () => {
  window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.userPeutSurStore = function () { return true; }; window.fcDroitEcriture = function () { return true; };
  window.fcDb = async function () { return true; }; window.dbPut = async function () { return true; }; window.deleteFromSupabase = function () {}; window.syncToSupabase = function () {}; window.logAction = async function () {};
};

test('ERP : phases lues ligne à ligne, plafonnées, texte échappé ; mention selon le statut', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(() => {
    var o = {}; o.p = fonPlanPhases('Phase 1 | 2027 | Voirie\nPhase 2|2028\n\n | vide\n' + Array.from({ length: 20 }, function (_, i) { return 'P' + i; }).join('\n'));
    o.n = o.p.length; o.h = fonPlanBlocHtml({ titre: '<img src=x>', version: '1', date_plan: '2026-11-01', programme: 'Prog', statut_plan: 'approuve', reference_acte: 'Arrêté 12/2026', phases: [{ nom: '<b>x</b>', periode: '', description: '' }], image: 'data:image/svg+xml;base64,AAAA' });
    o.h2 = fonPlanBlocHtml({ titre: 'T', version: '1', statut_plan: 'inconnu', phases: [] });
    return o;
  });
  assert.equal(r.n, 12); assert.deepEqual(r.p[0], { nom: 'Phase 1', periode: '2027', description: 'Voirie' }); assert.equal(r.p[1].description, '');
  assert.doesNotMatch(r.h, /<img src=x>/); assert.match(r.h, /&lt;img src=x&gt;/); assert.match(r.h, /Seul l(&#39;|')acte officiel fait foi/); assert.match(r.h, /Arrêté 12\/2026/); assert.doesNotMatch(r.h, /<img alt=/);   /* SVG refusé */
  assert.match(r.h, /Phases prévisionnelles/); assert.match(r.h, /sans engagement de date/); assert.match(r.h2, /non approuvé/);   /* statut inconnu = projet indicatif */
});

test('ERP : publication = administrateur, copie figée, « approuvé » exige l\'acte, retrait, historique', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async (st) => {
    new Function('(' + st + ')()')();
    var o = {}; window.confirm = function () { return true; };
    DATA.programmes = [{ id: 'g1', nom: 'Programme A' }]; DATA.plans_ensemble = [{ id: 'pl1', reference: 'PLE-1', programme_id: 'g1', titre: 'Plan', version: '1', date_plan: '2026-11-01', statut_plan: 'projet', phases_txt: 'Phase 1 | 2027 | Voirie', image: 'data:image/jpeg;base64,AAAA' }];
    var admin = true; window.fcEstAdmin = function () { return admin; };
    admin = false; await fonPlanPublier('pl1'); o.nonAdmin = DATA.plans_ensemble[0].publie === true; admin = true;
    DATA.plans_ensemble[0].statut_plan = 'approuve'; await fonPlanPublier('pl1'); o.sansActe = DATA.plans_ensemble[0].publie === true;
    DATA.plans_ensemble[0].statut_plan = 'projet'; await fonPlanPublier('pl1'); var d = DATA.plans_ensemble[0]; o.publie = d.publie === true && !!d.pub; o.copie = d.pub.phases.length === 1 && d.pub.image === d.image && d.pub.statut_plan === 'projet';
    d.titre = 'Brouillon modifié'; o.figee = d.pub.titre === 'Plan';   /* le brouillon n'altère pas la copie publiée */
    fonPlanRender(); o.rendu = true;
    await fonPlanRetirer('pl1'); o.retire = DATA.plans_ensemble[0].publie === false; o.histo = (DATA.plans_ensemble[0].historique_pub || []).map(function (x) { return x.action; }).join(',');
    DATA.plans_ensemble[0].image = ''; DATA.plans_ensemble[0].phases_txt = ''; await fonPlanPublier('pl1'); o.vide = DATA.plans_ensemble[0].publie === true;
    return o;
  }, stub.toString());
  assert.equal(r.nonAdmin, false); assert.equal(r.sansActe, false); assert.equal(r.publie, true); assert.equal(r.copie, true); assert.equal(r.figee, true); assert.equal(r.retire, true); assert.equal(r.histo, 'publié,retiré'); assert.equal(r.vide, false);
});

test('ERP : image réduite dans le navigateur (≤ 600 Ko, JPEG) ; fichier non raster refusé', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var o = {}, c = document.createElement('canvas'); c.width = 4000; c.height = 3000; var g = c.getContext('2d');
    for (var i = 0; i < 4000; i += 20) { g.fillStyle = 'rgb(' + (i % 255) + ',' + ((i * 7) % 255) + ',' + ((i * 13) % 255) + ')'; g.fillRect(i, 0, 20, 3000); }
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/png'); }); o.avant = blob.size;
    var out = await fonPlanReduireImage(new File([blob], 'plan.png', { type: 'image/png' })); o.apres = out.length; o.fmt = /^data:image\/jpeg;base64,/.test(out);
    var im = await new Promise(function (ok) { var x = new Image(); x.onload = function () { ok([x.width, x.height]); }; x.src = out; }); o.dim = im;
    try { await fonPlanReduireImage(new File(['<svg onload=alert(1)>'], 'x.svg', { type: 'image/svg+xml' })); o.svg = 'accepté'; } catch (e) { o.svg = e.message; }
    try { await fonPlanReduireImage(new File(['%PDF-1.4'], 'x.pdf', { type: 'application/pdf' })); o.pdf = 'accepté'; } catch (e) { o.pdf = e.message; }
    return o;
  });
  assert.ok(r.apres <= 600000, 'trop lourde : ' + r.apres); assert.equal(r.fmt, true); assert.ok(Math.max(...r.dim) <= 2000); assert.match(r.svg, /JPEG, PNG ou WebP/); assert.match(r.pdf, /convertissez/);
});

async function ouvrirPortail() {
  nav = nav || await chromium.launch({ executablePath: exe });
  const page = await (await nav.newContext()).newPage(); const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => /^file:/.test(r.request().url()) ? r.continue() : r.fulfill({ status: 200, body: '[]', contentType: 'application/json' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'portail-unique.html'));
  await page.waitForFunction(() => typeof ensembleOuvrir === 'function' && typeof ensImage === 'function');
  return { page, erreurs };
}
const PLANS = { plans: [{ id: 'pl1', programme: 'Programme <A>', titre: 'Plan <b>d\'ensemble</b>', version: '2', date_plan: '2026-11-01', statut_plan: 'projet', reference_acte: null, a_image: true,
  phases: [{ nom: 'Phase 1 <i>', periode: '2027', description: 'Voirie' }, { nom: 'Phase 2', periode: '', description: '' }] }] };

test('portail : plan publié affiché avec statut, mention et phases prévisionnelles ; texte échappé ; vide = message', async () => {
  const { page, erreurs } = await ouvrirPortail();
  const r = await page.evaluate(async (P) => {
    var o = {}; document.body.insertAdjacentHTML('beforeend', '<div id="s-ens"></div>'); window.S = window.S || {}; try { S.client = S.client || { id: 'c1' }; } catch (e) {}
    var urls = []; window.fetch = async function (u, opt) { urls.push([String(u), opt && opt.body]); return new Response(JSON.stringify(P), { status: 200 }); };
    await ensembleOuvrir(); var h = document.getElementById('s-ens').innerHTML; o.h = h; o.url = urls[0][0].split('/rpc/')[1]; o.corps = urls[0][1];
    document.getElementById('s-ens').setAttribute('data-ok', '0'); window.fetch = async function () { return new Response(JSON.stringify({ plans: [] }), { status: 200 }); };
    await ensembleOuvrir(); o.vide = document.getElementById('s-ens').textContent;
    return o;
  }, PLANS);
  assert.equal(r.url, 'fc_vue_plan_ensemble'); assert.equal(r.corps, '{}'); assert.match(r.h, /non approuvé/); assert.match(r.h, /Phases prévisionnelles/); assert.match(r.h, /sans engagement de date/); assert.match(r.h, /Voir le plan/);
  assert.doesNotMatch(r.h, /<b>d'ensemble<\/b>/); assert.match(r.h, /&lt;b&gt;/); assert.doesNotMatch(r.h, /<i>/); assert.match(r.vide, /Aucun plan d'ensemble n'est publié/); assert.deepEqual(erreurs, []);
});

test('portail : l\'image n\'est affichée que si elle est raster ; SVG ou contenu inattendu refusés ; image demandée par identifiant', async () => {
  const { page, erreurs } = await ouvrirPortail();
  const r = await page.evaluate(async () => {
    var o = {}, dialogs = []; window.alert = function (m) { dialogs.push(m); };
    document.body.insertAdjacentHTML('beforeend', '<div id="z"><button id="b">🖼️ Voir le plan</button></div>');
    var corps = null; window.fetch = async function (u, opt) { corps = opt.body; return new Response(JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQ' }), { status: 200 }); };
    await ensImage('pl1', document.getElementById('b')); o.corps = corps; o.img = !!document.querySelector('#z img') && document.querySelector('#z img').src.indexOf('data:image/jpeg') === 0;
    document.getElementById('z').innerHTML = '<button id="b">🖼️ Voir le plan</button>';
    window.fetch = async function () { return new Response(JSON.stringify({ image: 'data:image/svg+xml;base64,PHN2Zz4=' }), { status: 200 }); };
    await ensImage('pl1', document.getElementById('b')); o.svg = !!document.querySelector('#z img'); o.alerte = dialogs.length;
    document.getElementById('z').innerHTML = '<button id="b">🖼️ Voir le plan</button>';
    window.fetch = async function () { return new Response(JSON.stringify({ image: 'javascript:alert(1)' }), { status: 200 }); };
    await ensImage('pl1', document.getElementById('b')); o.js = !!document.querySelector('#z img');
    return o;
  });
  assert.equal(r.corps, JSON.stringify({ p_plan_id: 'pl1' })); assert.equal(r.img, true); assert.equal(r.svg, false); assert.equal(r.alerte, 1); assert.equal(r.js, false); assert.deepEqual(erreurs, []);
});

test('cohérence : mentions juridiques identiques dans l\'ERP et le portail ; SQL : publié seulement, copie figée, pas de donnée interne, droits réduits', () => {
  const erp = fs.readFileSync(path.join(__dirname, '..', 'menko-immo.html'), 'utf8'), por = fs.readFileSync(path.join(__dirname, '..', 'portail-unique.html'), 'utf8');
  for (const cle of ['projet', 'depose', 'approuve']) {
    const t = (src, nom) => { const m = src.match(new RegExp(nom + '[\\s\\S]{0,900}?\\b' + cle + ':\\s*"([^"]+)"')); return m && m[1]; };
    assert.ok(t(erp, 'FON_PLAN_MENTIONS'), 'mention ERP ' + cle); assert.equal(t(erp, 'FON_PLAN_MENTIONS'), t(por, 'ENS_MENTIONS'), 'mention différente : ' + cle);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'portail_plan_ensemble.sql'), 'utf8').split('-- ── Retour arrière')[0];
  assert.match(sql, /force row level security/); assert.match(sql, /revoke all on table public\.pi_plans_ensemble from anon/);
  assert.match(sql, /data ->> 'publie', ''\) = 'true'/); assert.match(sql, /'pub'/); assert.doesNotMatch(sql.slice(sql.indexOf('create or replace function public.fc_vue_plan_ensemble()')), /remarques|historique|'par'/);
  assert.match(sql, /revoke all on function public\.fc_vue_plan_ensemble\(\) from public, anon/); assert.match(sql, /revoke all on function public\.fc_vue_plan_ensemble_image\(text\) from public, anon/);
  assert.match(sql, /data:image\/\(jpeg\|png\|webp\)/); assert.match(sql, /<> 'approuve' or length\(trim/);
});
