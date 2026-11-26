/* Foncier L4 — comptabilité SYSCOHADA des parcelles : acquisition (immobilisation / stock), sortie à la cession, contrôles de classe. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page, cd) {
  await page.evaluate(function (cd) {
    DATA.params.comptes_defaut = Object.assign({}, DATA.params.comptes_defaut, { terrain_contrepartie: '401', parcelle_immo: '221', cession_vnc: '812', terrain_stock: '335', terrain_achat: '601', terrain_variation: '6031',
      client_foncier: '4111', cession_produit: '822', cession_produit_immo: '822', cession_produit_stock: '701' }, cd || {});
    DATA.ecritures = []; DATA.cessions_foncieres = []; DATA.af_operations = [];
    DATA.parcelles = [{ id: 'pc1', ref: 'PARC-1', commune: 'Grand-Lahou', superficie: 10000, prix_acq: 8000000, frais_mutation: 500000, frais_bornage: 300000, frais_notaire: 200000, traitement_compta: 'immobilisation', date_acquisition: '2026-03-10' }];
    window.__eq = function (e) { const L = e.lignes, D = L.filter(function (l) { return l.sens === 'D'; }).reduce(function (s, l) { return s + l.montant; }, 0), C = L.filter(function (l) { return l.sens === 'C'; }).reduce(function (s, l) { return s + l.montant; }, 0); return D === C; };
  }, cd);
}

test('immobilisation : D 221 par composante / C contrepartie, frais incorporés, équilibrée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const x = await comptabiliserAcquisitionParcelle(DATA.parcelles[0]), e = x.ecriture;
      return { ok: x.ok, eq: __eq(e), montant: e.montant, deb: e.lignes.filter(function (l) { return l.sens === 'D'; }).map(function (l) { return l.compte + ':' + l.montant; }), cred: e.lignes.filter(function (l) { return l.sens === 'C'; }).map(function (l) { return l.compte + ':' + l.montant; }), date: e.date };
    });
    assert.equal(r.ok, true); assert.equal(r.eq, true); assert.equal(r.montant, 9000000);
    assert.deepEqual(r.deb, ['221:8000000', '221:500000', '221:300000', '221:200000']); assert.deepEqual(r.cred, ['401:9000000']); assert.equal(r.date, '2026-03-10');
  } finally { await app.fermer(); }
});

test('stock : achat / contrepartie puis entrée en stock / variation, équilibrée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.parcelles[0].traitement_compta = 'stock';
      const e = (await comptabiliserAcquisitionParcelle(DATA.parcelles[0])).ecriture;
      return { eq: __eq(e), l: e.lignes.map(function (l) { return l.sens + l.compte + ':' + l.montant; }) };
    });
    assert.equal(r.eq, true); assert.deepEqual(r.l, ['D601:9000000', 'C401:9000000', 'D335:9000000', 'C6031:9000000']);
  } finally { await app.fermer(); }
});

test('contrôle de classe : compte de terrain hors classe 22 refusé, aucune écriture', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { parcelle_immo: '611' });
    const r = await app.page.evaluate(async function () {
      let err = ''; try { await comptabiliserAcquisitionParcelle(DATA.parcelles[0]); } catch (e) { err = e.message; }
      return { err: err, n: DATA.ecritures.length };
    });
    assert.match(r.err, /COMPTE_NON_CONFORME:parcelle_immo/); assert.equal(r.n, 0);
  } finally { await app.fermer(); }
});

test('idempotence : une seule écriture, mise à jour du montant, retrait si traitement vidé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const p = DATA.parcelles[0];
      await comptabiliserAcquisitionParcelle(p); await comptabiliserAcquisitionParcelle(p);
      const n1 = DATA.ecritures.length; p.prix_acq = 9000000; await comptabiliserAcquisitionParcelle(p);
      const m = DATA.ecritures[0].montant, n2 = DATA.ecritures.length; p.traitement_compta = ''; const ret = await comptabiliserAcquisitionParcelle(p);
      return { n1: n1, m: m, n2: n2, retire: ret.retire, n3: DATA.ecritures.length };
    });
    assert.equal(r.n1, 1); assert.equal(r.m, 10000000); assert.equal(r.n2, 1); assert.equal(r.retire, true); assert.equal(r.n3, 0);
  } finally { await app.fermer(); }
});

test('écriture visée : jamais modifiée, le verrou est signalé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const p = DATA.parcelles[0]; await comptabiliserAcquisitionParcelle(p);
      DATA.ecritures[0].valide_le = new Date().toISOString(); p.prix_acq = 1;
      const x = await comptabiliserAcquisitionParcelle(p);
      p.traitement_compta = ''; const y = await comptabiliserAcquisitionParcelle(p);
      return { ok: x.ok, verrou: x.verrou, montant: DATA.ecritures[0].montant, retire: y.retire, n: DATA.ecritures.length };
    });
    assert.equal(r.ok, false); assert.ok(r.verrou); assert.equal(r.montant, 9000000); assert.equal(r.retire, false); assert.equal(r.n, 1);
  } finally { await app.fermer(); }
});

test('cession d\'immobilisation : sortie VNC au prorata (50 %), vente et marge cohérentes', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const c = { id: 'c1', source_key: 'parcelle:pc1', source_type: 'parcelle', source_id: 'pc1', superficie: 5000, prix_cession: 7000000, montant_encaisse: 0, date: '2026-06-01', acquereur: 'M. Test', designation: '5000 m²', dossier: 'CES-1' };
      await cesGenererEcriture(c);
      const s = DATA.ecritures.find(function (e) { return e.id === 'ecr_ces_sortie_parc_c1'; });
      return { s: s && s.lignes.map(function (l) { return l.sens + l.compte + ':' + l.montant; }), eq: s && __eq(s), nb: DATA.ecritures.length };
    });
    assert.deepEqual(r.s, ['D812:4500000', 'C221:4500000']); assert.equal(r.eq, true); assert.equal(r.nb, 2);
  } finally { await app.fermer(); }
});

test('cession d\'un terrain en stock : D variation / C stock, au prorata', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.parcelles[0].traitement_compta = 'stock';
      await cesGenererEcriture({ id: 'c2', source_key: 'parcelle:pc1', superficie: 2500, prix_cession: 3000000, montant_encaisse: 0, date: '2026-06-01', acquereur: 'X', designation: 'd' });
      return DATA.ecritures.find(function (e) { return e.id === 'ecr_ces_sortie_parc_c2'; }).lignes.map(function (l) { return l.sens + l.compte + ':' + l.montant; });
    });
    assert.deepEqual(r, ['D6031:2250000', 'C335:2250000']);
  } finally { await app.fermer(); }
});

test('sans traitement comptable : cession inchangée (aucune sortie) ; modification de la superficie met à jour la sortie', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.parcelles[0].traitement_compta = '';
      const c = { id: 'c3', source_key: 'parcelle:pc1', superficie: 5000, prix_cession: 1000000, montant_encaisse: 0, date: '2026-06-01', acquereur: 'X', designation: 'd' };
      await cesGenererEcriture(c); const sans = DATA.ecritures.filter(function (e) { return e.cession_id === 'c3' && e.parcelle_id; }).length;
      DATA.parcelles[0].traitement_compta = 'immobilisation'; await cesGenererEcriture(c);
      c.superficie = 1000; await cesGenererEcriture(c);
      const s = DATA.ecritures.filter(function (e) { return e.id === 'ecr_ces_sortie_parc_c3'; });
      return { sans: sans, n: s.length, m: s[0].montant };
    });
    assert.equal(r.sans, 0); assert.equal(r.n, 1); assert.equal(r.m, 900000);
  } finally { await app.fermer(); }
});

test('écran parcelle : l\'enregistrement comptabilise l\'acquisition et ne bloque pas si le compte manque', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.parcelles = [];
      openParcelle();
      const set = function (id, v) { document.getElementById(id).value = v; };
      set('parc-ref', 'PARC-9'); set('parc-regime', 'urbain'); set('parc-localisation', 'Zone A'); set('parc-sf-totale', '1000'); set('parc-prix-acq', '2000000'); set('parc-traitement-compta', 'immobilisation'); set('parc-date-acquisition', '2026-02-01');
      await saveParcelle();
      const a = { parc: DATA.parcelles.length, ecr: DATA.ecritures.length, mont: DATA.ecritures[0] && DATA.ecritures[0].montant };
      DATA.params.comptes_defaut.parcelle_immo = '';
      openParcelle(DATA.parcelles[0].id); set('parc-prix-acq', '3000000'); await saveParcelle();
      return { a: a, apres: { prix: DATA.parcelles[0].prix_acq, ecr: DATA.ecritures[0].montant } };
    });
    assert.equal(r.a.parc, 1); assert.equal(r.a.ecr, 1); assert.equal(r.a.mont, 2000000);
    assert.equal(r.apres.prix, 3000000);
  } finally { await app.fermer(); }
});

test('résiliation : la sortie est contre-passée une seule fois, l\'écriture d\'origine est conservée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const c = { id: 'c4', source_key: 'parcelle:pc1', superficie: 5000, prix_cession: 7000000, montant_encaisse: 0, date: '2026-06-01', acquereur: 'X', designation: 'd' };
      await cesGenererEcriture(c);
      const a = await contrepasserSortieCessionParcelle(c), b = await contrepasserSortieCessionParcelle(c);
      const orig = DATA.ecritures.find(function (e) { return e.id === 'ecr_ces_sortie_parc_c4'; });
      return { annul: a.lignes.map(function (l) { return l.sens + l.compte + ':' + l.montant; }), second: b, origine: orig.lignes.length, eq: __eq(a) };
    });
    assert.deepEqual(r.annul, ['C812:4500000', 'D221:4500000']); assert.equal(r.second, null); assert.equal(r.origine, 2); assert.equal(r.eq, true);
  } finally { await app.fermer(); }
});

test('produit de cession : 82x pour une immobilisation, 70x pour un stock ; compte générique de mauvaise classe refusé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page, { cession_produit: '701', cession_produit_immo: '', cession_produit_stock: '' });
    const r = await app.page.evaluate(async function () {
      const c = function (id) { return { id: id, source_key: 'parcelle:pc1', superficie: 1000, prix_cession: 1000000, montant_encaisse: 0, date: '2026-06-01', acquereur: 'X', designation: 'd' }; };
      const produit = function (id) { const e = DATA.ecritures.find(function (x) { return x.id === 'ecr_ces_vente_' + id; }); return e ? e.compte_credit : null; };
      const out = {};
      // immobilisation avec seulement le compte générique 701 : classe 82 attendue → refus
      try { await cesGenererEcriture(c('a')); out.generique = 'accepté'; } catch (e) { out.generique = String(e.message); }
      // immobilisation avec compte dédié 822 → crédit 822
      DATA.params.comptes_defaut.cession_produit_immo = '822'; await cesGenererEcriture(c('b')); out.immo = produit('b');
      // dédié mal classé (701) pour une immobilisation → refus
      DATA.params.comptes_defaut.cession_produit_immo = '701'; try { await cesGenererEcriture(c('c')); out.mauvais = 'accepté'; } catch (e) { out.mauvais = String(e.message); }
      // stock : générique 701 (classe 70) accepté ; dédié 822 refusé
      DATA.parcelles[0].traitement_compta = 'stock'; await cesGenererEcriture(c('d')); out.stock = produit('d');
      DATA.params.comptes_defaut.cession_produit_stock = '822'; try { await cesGenererEcriture(c('e')); out.stockMauvais = 'accepté'; } catch (e) { out.stockMauvais = String(e.message); }
      // sans traitement comptable : comportement historique (compte générique)
      DATA.parcelles[0].traitement_compta = ''; await cesGenererEcriture(c('f')); out.sans = produit('f');
      return out;
    });
    assert.match(r.generique, /COMPTE_NON_CONFORME:cession_produit_immo/); assert.equal(r.immo, '822'); assert.match(r.mauvais, /COMPTE_NON_CONFORME:cession_produit_immo/);
    assert.equal(r.stock, '701'); assert.match(r.stockMauvais, /COMPTE_NON_CONFORME:cession_produit_stock/); assert.equal(r.sans, '701');
  } finally { await app.fermer(); }
});
