/* Foncier L6 — saisie terrain : GPS → borne, photo géolocalisée, signature au doigt. Le VRAI ERP (Chromium), GPS simulé. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('../tests-compta/harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    DATA.parcelles = [{ id: 'pc1', ref: 'PARC-1', regime: 'rural', utm_zone: 30, superficie: 10000, bornes: [] },
      { id: 'pc2', ref: 'PARC-2', regime: 'urbain', utm_zone: 30, superficie: 10000, bornes: [{ nom: 'B1', x: 400000, y: 600000 }, { nom: 'B2', x: 400100, y: 600000 }, { nom: 'B3', x: 400100, y: 600100 }, { nom: 'B4', x: 400000, y: 600100 }] }];
    DATA.bornages_fonciers = []; DATA.documents = [];
    FON_RURAL.terrainParcelle = 'pc1';
    window.__gps = function (E, N, acc, alt) { const ll = utm30ToLatLng(E, N, 30); navigator.geolocation.getCurrentPosition = function (ok) { ok({ coords: { latitude: ll[0], longitude: ll[1], accuracy: acc, altitude: alt === undefined ? null : alt } }); }; };
    window.__gpsErreur = function (code) { navigator.geolocation.getCurrentPosition = function (ok, ko) { ko({ code: code }); }; };
  });
}

test('GPS → borne : coordonnées UTM exactes, nom, précision, altitude', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      __gps(400250.55, 600300.25, 4.26, 31.04);
      const ok = await fonTerrainAjouterBorne(), b = DATA.parcelles[0].bornes[0];
      return { ok: ok, b: b, n: DATA.parcelles.length };
    });
    assert.equal(r.ok, true); assert.equal(r.b.nom, 'B1'); assert.ok(Math.abs(r.b.x - 400250.55) < 0.05 && Math.abs(r.b.y - 600300.25) < 0.05, JSON.stringify(r.b));
    assert.equal(r.b.precision_m, 4.3); assert.equal(r.b.z, 31); assert.equal(r.b.source, 'gps');
  } finally { await app.fermer(); }
});

test('GPS : précision insuffisante → confirmation ; refus de l\'utilisateur → rien enregistré', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    app.etat.confirm = false;
    const r = await app.page.evaluate(async function () {
      __gps(400250, 600300, 55);
      const refus = await fonTerrainAjouterBorne(); return { refus: refus, n: DATA.parcelles[0].bornes.length };
    });
    assert.equal(r.refus, false); assert.equal(r.n, 0); assert.ok(app.etat.dialogues.some(function (d) { return /55 m/.test(d); }));
    app.etat.confirm = true;
    const r2 = await app.page.evaluate(async function () { __gps(400250, 600300, 55); return { ok: await fonTerrainAjouterBorne(), n: DATA.parcelles[0].bornes.length }; });
    assert.equal(r2.ok, true); assert.equal(r2.n, 1);
  } finally { await app.fermer(); }
});

test('GPS : doublon refusé, GPS indisponible ou refusé → message clair', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      __gps(400250, 600300, 3); await fonTerrainAjouterBorne();
      __gps(400250.3, 600300.2, 3); const dbl = await fonTerrainAjouterBorne();
      __gpsErreur(1); window.__toasts.length = 0; const ref = await fonTerrainAjouterBorne(); const msg = window.__toasts.join('|');
      return { dbl: dbl, n: DATA.parcelles[0].bornes.length, ref: ref, msg: msg };
    });
    assert.equal(r.dbl, false); assert.equal(r.n, 1); assert.equal(r.ref, false); assert.match(r.msg, /Autorisation GPS refusée/);
  } finally { await app.fermer(); }
});

test('GPS : un 3e point qui ferait recouvrir une autre parcelle est refusé et annulé', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      const p = DATA.parcelles[0]; p.bornes = [{ nom: 'B1', x: 400050, y: 600050 }, { nom: 'B2', x: 400300, y: 600050 }];
      __gps(400300, 600300, 3); window.__toasts.length = 0; const ok = await fonTerrainAjouterBorne();
      return { ok: ok, n: p.bornes.length, msg: window.__toasts.join('|') };
    });
    assert.equal(r.ok, false); assert.equal(r.n, 2); assert.match(r.msg, /recouvrirait PARC-2/);
  } finally { await app.fermer(); }
});

test('photo : compressée à 1280 px max, géolocalisée, rattachée à la parcelle', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      __gps(400250, 600300, 6);
      const cv = document.createElement('canvas'); cv.width = 3200; cv.height = 2400; const g = cv.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 3200, 2400); g.fillStyle = '#c33'; g.fillRect(500, 400, 900, 700);
      const blob = await new Promise(function (res) { cv.toBlob(res, 'image/png'); }), file = new File([blob], 'x.png', { type: 'image/png' });
      const ok = await fonTerrainPhotoTraiter(file), d = DATA.documents.length ? DATA.documents[0] : (await docsDeEntite('parcelle_photo', 'pc1', true))[0];
      const dim = await new Promise(function (res) { const im = new Image(); im.onload = function () { res([im.naturalWidth, im.naturalHeight]); }; im.src = d.blob; });
      const mauvais = await fonTerrainPhotoTraiter(new File(['abc'], 'a.txt', { type: 'text/plain' }));
      return { ok: ok, mauvais: mauvais, dim: dim, ent: d.entity_type, id: d.entity_id, lat: typeof d.lat, acc: d.precision_m, taille: d.size, orig: blob.size };
    });
    assert.equal(r.ok, true); assert.equal(r.mauvais, false); assert.deepEqual(r.dim, [1280, 960]); assert.equal(r.ent, 'parcelle_photo'); assert.equal(r.id, 'pc1'); assert.equal(r.lat, 'number'); assert.equal(r.acc, 6);
  } finally { await app.fermer(); }
});

test('photo sans GPS : enregistrée quand même, signalée', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      __gpsErreur(2); window.__toasts.length = 0;
      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 100; cv.getContext('2d').fillRect(0, 0, 200, 100);
      const blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg'); });
      const ok = await fonTerrainPhotoTraiter(new File([blob], 'y.jpg', { type: 'image/jpeg' })), docs = await docsDeEntite('parcelle_photo', 'pc1', true);
      return { ok: ok, n: docs.length, lat: docs[0].lat, msg: window.__toasts.join('|') };
    });
    assert.equal(r.ok, true); assert.equal(r.n, 1); assert.equal(r.lat, undefined); assert.match(r.msg, /sans position GPS/);
  } finally { await app.fermer(); }
});

test('signature : cadre vide refusé, signature valide enregistrée, présence et signé posés', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-1', parcelle_id: 'pc1', statut: 'convoque', pv_ref: '', convocations: [{ nom: 'M. Voisin', qualite: 'riverain', present: false, signe: false }, { nom: 'Mme Chef', qualite: 'chefferie', present: false, signe: false }] }];
      fonSignatureOuvrir('b1'); fonSignatureChoisir(0);
      window.__toasts.length = 0; const vide = await fonSignatureValider(), msgVide = window.__toasts.join('|');
      const cv = document.getElementById('fon-sig-canvas'), g = cv.getContext('2d'); g.strokeStyle = '#000'; g.lineWidth = 4; g.beginPath(); g.moveTo(20, 150); g.bezierCurveTo(100, 20, 200, 180, 400, 40); g.stroke();
      const encre = fonSignatureEncre(cv), ok = await fonSignatureValider(), c = DATA.bornages_fonciers[0].convocations[0], c2 = DATA.bornages_fonciers[0].convocations[1];
      return { vide: vide, msgVide: msgVide, encre: encre, ok: ok, signe: c.signe, present: c.present, png: c.signature.slice(0, 22), le: !!c.signe_le, autre: c2.signe };
    });
    assert.equal(r.vide, false); assert.match(r.msgVide, /trop courte/); assert.ok(r.encre >= 60); assert.equal(r.ok, true);
    assert.equal(r.signe, true); assert.equal(r.present, true); assert.equal(r.png, 'data:image/png;base64,'); assert.equal(r.le, true); assert.equal(r.autre, false);
  } finally { await app.fermer(); }
});

test('signature : le bornage devient réalisable (PV + riverain présent par signature)', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      DATA.bornages_fonciers = [{ id: 'b1', reference: 'BRN-1', parcelle_id: 'pc1', statut: 'convoque', pv_ref: 'PV-9', convocations: [{ nom: 'M. Voisin', qualite: 'riverain', present: false, signe: false }] }];
      await fonRuralAction('bornages', 'b1', 'realise'); const avant = DATA.bornages_fonciers[0].statut;
      fonSignatureOuvrir('b1'); fonSignatureChoisir(0); const cv = document.getElementById('fon-sig-canvas'), g = cv.getContext('2d'); g.lineWidth = 4; g.beginPath(); g.moveTo(10, 100); g.lineTo(450, 120); g.stroke();
      await fonSignatureValider(); await fonRuralAction('bornages', 'b1', 'realise');
      return { avant: avant, apres: DATA.bornages_fonciers[0].statut };
    });
    assert.equal(r.avant, 'convoque'); assert.equal(r.apres, 'realise');
  } finally { await app.fermer(); }
});

test('écran terrain : état réseau, file d\'attente, bornes et photos ; aucune erreur de page', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      fonRuralVue('terrain'); const h1 = document.getElementById('fon-rural-liste').innerHTML;
      localStorage.setItem('pici_sync_outbox', JSON.stringify([{ op: 'upsert', table: 'pi_parcelles', id: 'x', obj: {} }, { op: 'upsert', table: 'pi_parcelles', id: 'y', obj: {} }]));
      DATA.parcelles[0].bornes = [{ nom: 'B1', x: 400000, y: 600000, precision_m: 3.2, source: 'gps' }]; fonTerrainRender();
      await new Promise(function (r) { setTimeout(r, 200); }); const h2 = document.getElementById('fon-rural-liste').innerHTML; localStorage.removeItem('pici_sync_outbox');
      return { online: /En ligne/.test(h1), attente: /2 envoi\(s\) en attente/.test(h2), borne: /B1 · E 400000/.test(h2) && /GPS/.test(h2), photos: /Aucune photo/.test(document.getElementById('fon-rural-liste').innerHTML) };
    });
    assert.deepEqual(r, { online: true, attente: true, borne: true, photos: true }); assert.equal(app.etat.erreursPage.length, 0, app.etat.erreursPage.join('|'));
  } finally { await app.fermer(); }
});
