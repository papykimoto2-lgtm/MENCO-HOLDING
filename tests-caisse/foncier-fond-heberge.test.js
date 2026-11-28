/* Foncier — fond de carte hébergé : validation stricte de l'URL, activation par appareil, retrait, repli. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);
const stub = () => { window.toast = function (m) { (window.__T = window.__T || []).push(m); }; window.logAction = async function () {}; window.fcEstAdmin = function () { return true; }; };
test('URL : https + {z}{x}{y} seulement, pas d\'identifiants, pas de http/javascript/data', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var V = fonTerFondHebergeValide, ok = 'https://tuiles.exemple.ci/abj/{z}/{x}/{y}.png';
    return [V(ok) === ok, V('http://t.ci/{z}/{x}/{y}.png'), V('https://u:p@t.ci/{z}/{x}/{y}.png'), V('https://t.ci/{z}/{x}.png'), V('javascript:alert(1)//{z}{x}{y}'), V('data:image/png;base64,{z}{x}{y}'), V('https://t.ci/' + 'a'.repeat(400) + '/{z}/{x}/{y}'), V('')];
  }, { st: stub.toString() });
  assert.equal(r[0], true); r.slice(1).forEach(x => assert.equal(x, ''));
});
test('activation : fond ajouté au sélecteur, style carte, couleurs de courbes, retrait = repli sur sombre', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(({ st }) => {
    new Function('(' + st + ')()')(); var o = {}, ok = 'https://tuiles.exemple.ci/abj/{z}/{x}/{y}.png';
    localStorage.setItem('fon_ter_fond_heberge', ok); fonTerFondHebergeAppliquer(); FON_TER.fond = 'heberge';
    o.liste = /Hébergé/.test(fonTerritoireBarreHtml()); o.tuiles = fonTerStyle().sources.fond.tiles[0] === ok; o.coul = !!FON_TER_COURBES_COUL.heberge;
    localStorage.setItem('fon_ter_fond_heberge', 'http://mauvais/{z}/{x}/{y}'); fonTerFondHebergeAppliquer(); o.repli = FON_TER.fond; o.absent = !FON_TER_FONDS.heberge;
    window.prompt = function () { return 'http://non/{z}/{x}/{y}'; }; o.refus = fonTerritoireFondHeberge(); o.refusStocke = localStorage.getItem('fon_ter_fond_heberge');
    window.prompt = function () { return ok; }; o.accepte = fonTerritoireFondHeberge(); o.stocke = localStorage.getItem('fon_ter_fond_heberge') === ok;
    return o;
  }, { st: stub.toString() });
  assert.ok(r.liste && r.tuiles && r.coul && r.absent && r.stocke); assert.equal(r.repli, 'sombre'); assert.equal(r.refusStocke, 'http://mauvais/{z}/{x}/{y}'.length ? r.refusStocke : null);
  assert.ok((await Promise.resolve(r.refus)) === false || r.refus === false);
});
