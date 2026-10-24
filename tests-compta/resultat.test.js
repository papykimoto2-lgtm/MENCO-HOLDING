const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

test('Compte de résultat : une vente contre-passée et une charge extournée s\'annulent', async () => {
  const app = await ouvrirApp();
  try {
    const R = await app.page.evaluate(function () {
      DATA.ecritures = [E('s1','2025-02-01','4111','701',1000), E('s2','2025-02-02','701','4111',1000),
                        E('c1','2025-02-03','641','512',400), E('c2','2025-02-04','512','641',400)];
      const r = _calcResultat('2025');
      return { ventes: r.ventes, personnel: r.personnel, rNet: r.rNet };
    });
    assert.equal(R.ventes, 0);
    assert.equal(R.personnel, 0);
    assert.equal(R.rNet, 0);
  } finally { await app.fermer(); }
});

test('Compte de résultat : même résultat que le Bilan, y compris comptes hors rubriques (697, 79, classe 8)', async () => {
  const app = await ouvrirApp();
  try {
    const R = await app.page.evaluate(function () {
      DATA.ecritures = [E('a','2025-02-01','4111','701',900), E('b','2025-03-02','601','512',100), E('c','2025-03-03','697','512',30),
                        E('d','2025-03-04','512','821',50), E('e','2025-03-05','512','791',20)];
      const r = _calcResultat('2025'), b = calcBilan(2025, '');
      return { avantIS: r.rAvantIS, bilan: b.resultat, produits: r.totalProduits, charges: r.totalCharges, is: r.is, rNet: r.rNet };
    });
    assert.equal(R.avantIS, R.bilan);            /* 900 - 100 - 30 + 50 + 20 = 840 */
    assert.equal(R.bilan, 840);
    assert.equal(R.produits - R.charges, R.rNet);
  } finally { await app.fermer(); }
});

test('Tableau de bord : produits et charges nets des contre-passations', async () => {
  const app = await ouvrirApp();
  try {
    const R = await app.page.evaluate(function () {
      DATA.ecritures = [E('s1','2025-02-01','4111','701',1000), E('s2','2025-02-02','701','4111',300), E('c1','2025-02-03','641','512',400), E('c2','2025-02-04','512','641',100)];
      return { p: dashProduits(), c: dashDecaissements() };
    });
    assert.equal(R.p, 700);
    assert.equal(R.c, 300);
  } finally { await app.fermer(); }
});
