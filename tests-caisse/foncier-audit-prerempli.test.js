/* Foncier — audit pré-acquisition : le choix de l'opération (ou de la parcelle) préremplit le formulaire sans écraser la saisie. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('choix de l\'opération : champs préremplis, suivis au changement, saisie préservée, « Aucune » les vide', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    var o = {}, V = function (id) { return document.getElementById(id).value; }, choisir = function (id, v) { var e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); fonAuditPreRemplir(); };
    DATA.parcelles = [{ id: 'p1', ref: 'P1', regime: 'rural', commune: 'Dabou', superficie: 500000 }, { id: 'p2', ref: 'P2', regime: 'urbain', commune: 'Bingerville', superficie: 20000 }];
    DATA.dossiers_fonciers = [{ id: 'd1', reference: 'DF-1', parcelle_id: 'p1', statut: 'en_cours', etapes: [] }, { id: 'd2', reference: 'DF-2', parcelle_id: 'p2', statut: 'en_cours', etapes: [] }, { id: 'd3', reference: 'DF-3', parcelle_id: 'p2', statut: 'en_cours', etapes: [] }];
    DATA.programmes = [{ id: 'g1', nom: 'Prog', parcelle_id: 'p1', menko: { geometre: 'Cabinet Konan' } }]; DATA.protocoles_purge_fonciers = [];
    DATA.af_operations = [{ id: 'op1', nom: 'DABRE 2026', commune: 'Dabré', village: 'Dabré-village', superficie: 450000, parcelle_id: 'p1' }, { id: 'op2', nom: 'ANDOU', commune: 'Andou', village: 'Andou M\'Batto', superficie: 0, parcelle_id: 'p2' }];
    fonAuditNouveau();
    choisir('fau-operation', 'op1');
    o.op1 = ['fau-code', 'fau-parcelle', 'fau-dossier', 'fau-zone', 'fau-commune', 'fau-village', 'fau-superficie', 'fau-geometre'].map(V);
    document.getElementById('fau-commune').value = 'Saisie à la main'; document.getElementById('fau-commune').dispatchEvent(new Event('input', { bubbles: true }));   /* l'utilisateur corrige */
    choisir('fau-operation', 'op2');
    o.op2 = ['fau-code', 'fau-parcelle', 'fau-dossier', 'fau-zone', 'fau-commune', 'fau-village', 'fau-superficie', 'fau-geometre'].map(V);
    choisir('fau-operation', '');
    o.aucune = ['fau-code', 'fau-parcelle', 'fau-dossier', 'fau-commune', 'fau-village', 'fau-superficie', 'fau-geometre'].map(V); o.zoneAucune = V('fau-zone'); o.communeSaisie = V('fau-commune');
    return o;
  });
  assert.deepEqual(r.op1, ['DABRE 2026', 'p1', 'd1', 'rural', 'Dabré', 'Dabré-village', '450000', 'Cabinet Konan']);
  assert.deepEqual(r.op2, ['ANDOU', 'p2', '', 'urbain', 'Saisie à la main', "Andou M'Batto", '20000', '']);   /* 2 dossiers sur p2 : pas de choix d'office ; superficie opération 0 -> celle de la parcelle */
  assert.deepEqual(r.aucune, ['', '', '', 'Saisie à la main', '', '', '']); assert.equal(r.zoneAucune, 'urbain'); assert.equal(r.communeSaisie, 'Saisie à la main');
});

test('choix manuel de la parcelle : dossier, zone et commune suivent ; le choix n\'est pas écrasé par l\'opération', async () => {
  const app = await ouvrirApp();
  const r = await app.page.evaluate(async () => {
    DATA.parcelles = [{ id: 'p1', ref: 'P1', regime: 'rural', commune: 'Dabou', superficie: 500000 }, { id: 'p2', ref: 'P2', regime: 'urbain', commune: 'Bingerville', superficie: 20000 }];
    DATA.dossiers_fonciers = [{ id: 'd1', reference: 'DF-1', parcelle_id: 'p1', statut: 'en_cours', etapes: [] }]; DATA.programmes = []; DATA.protocoles_purge_fonciers = [];
    DATA.af_operations = [{ id: 'op2', nom: 'ANDOU', parcelle_id: 'p2', commune: '', village: '' }];
    fonAuditNouveau();
    var p = document.getElementById('fau-parcelle'); p.value = 'p1'; p.dispatchEvent(new Event('change', { bubbles: true }));
    var apresParcelle = [document.getElementById('fau-dossier').value, document.getElementById('fau-zone').value, document.getElementById('fau-commune').value, document.getElementById('fau-superficie').value];
    var op = document.getElementById('fau-operation'); op.value = 'op2'; op.dispatchEvent(new Event('change', { bubbles: true })); fonAuditPreRemplir();
    return { apresParcelle: apresParcelle, parcelleGardee: p.value };
  });
  assert.deepEqual(r.apresParcelle, ['d1', 'rural', 'Dabou', '500000']); assert.equal(r.parcelleGardee, 'p1');
});
