/* Foncier — audits et PV de remise : dossier_id facultatif ; audit dérive la parcelle du dossier. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('audit + PV portent dossier_id', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var T = [], o = {};
    window.toast = function (m) { T.push(m); }; window.fcDroitEcriture = function () { return true; };
    window.fcDb = async function () { return true; }; window.fonDroitsPreparer = function () { return ''; }; window.fonDroitsValider = function () { return ''; };
    window.fonAuditOuvrir = function () {}; window.fonRuralRender = function () {};
    DATA.parcelles = [{ id: 'p1', ref: 'P1' }, { id: 'p2', ref: 'P2' }];
    DATA.dossiers_fonciers = [{ id: 'd1', reference: 'DF-1', parcelle_id: 'p2', statut: 'en_cours', etapes: [] }];
    DATA.audits_fonciers = []; DATA.lots = [{ id: 'l1', numero: '1' }]; DATA.clients = [{ id: 'c1', nom: 'A', lot_id: 'l1' }];
    fonAuditNouveau();
    o.champAudit = !!document.getElementById('fau-dossier');
    document.getElementById('fau-auditeur').value = 'Aud'; document.getElementById('fau-dossier').value = 'd1'; document.getElementById('fau-parcelle').value = 'p1';
    await fonAuditCreer();
    o.audit = { dossier: (DATA.audits_fonciers[0] || {}).dossier_id, parcelle: (DATA.audits_fonciers[0] || {}).parcelle_id };
    ['pv_lot', 'pv_acd'].forEach(function (k) { fonRuralOuvrir(k, null); o[k] = !!document.getElementById('fonr-dossier_id'); });
    return o;
  });
  assert.equal(r.champAudit, true); assert.deepEqual(r.audit, { dossier: 'd1', parcelle: 'p2' });
  assert.equal(r.pv_lot, true); assert.equal(r.pv_acd, true);
});
