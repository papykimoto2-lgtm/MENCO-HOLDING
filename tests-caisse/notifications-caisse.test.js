const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { ouvrirApp, fermerNavigateur } = require('./harness');
after(fermerNavigateur);

async function amorcer(page) {
  await page.evaluate(function () {
    var il = new Date(Date.now() - 30 * 3600000).toISOString();
    DATA.caisses = [{ id: 'c1', nom: 'CAISSE TEST', caissiere_ids: [] }];
    DATA.caisse_sessions = [{ id: 's1', caisse_id: 'c1', date: il.slice(0, 10), statut: 'ouverte', fond_ouverture: 100000, ouverte_par: 'Kou', ouverte_le: il }];
    DATA.caisse_mouvements = [{ id: 'a', session_id: 's1', caisse_id: 'c1', type: 'sortie', montant: 5000, requiert_validation: true, valide: false, numero: 'BS-1' }];
    DATA.users = [{ id: 'u1', nom: 'Directrice', login: 'dg', role: 'admin', actif: true, tel: '07 00 00 00 00', email: 'dg@exemple.com' }, { id: 'u2', nom: 'Sans contact', login: 'x', actif: true }];
    window.caissesVisibles = function () { return DATA.caisses; };
  });
}

test('message de synthèse : caisse, solde, bon en attente et alerte session > 24 h', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const t = await app.page.evaluate(function () { return caisseNotifTexte(); });
    assert.match(t, /CAISSE TEST : OUVERTE/);
    assert.match(t, /1 bon\(s\) en attente de validation/);
    assert.match(t, /Session ouverte depuis plus de 24 h : CAISSE TEST/);
  } finally { await app.fermer(); }
});

test('fenêtre d\'envoi : destinataires avec contact, pré-remplissage, WhatsApp sur le bon numéro', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(function () {
      var ouverts = []; window.open = function (u) { ouverts.push(u); };
      caisseNotifOuvrir();
      var nb = document.querySelectorAll('#cn-dest option').length;
      document.getElementById('cn-dest').value = 'u1'; caisseNotifChoisir();
      var tel = document.getElementById('cn-tel').value, mail = document.getElementById('cn-mail').value;
      caisseNotifEnvoyerWA();
      return { nb: nb, tel: tel, mail: mail, url: ouverts[0] || '' };
    });
    assert.equal(r.nb, 2);                       /* « Choisir » + Directrice (l'utilisateur sans contact est exclu) */
    assert.equal(r.tel, '07 00 00 00 00'); assert.equal(r.mail, 'dg@exemple.com');
    assert.match(r.url, /^https:\/\/wa\.me\/2250700000000\?text=/);
  } finally { await app.fermer(); }
});

test('e-mail : adresse invalide refusée, sinon ouverture de la messagerie', async () => {
  const app = await ouvrirApp();
  try {
    await amorcer(app.page);
    const r = await app.page.evaluate(async function () {
      caisseNotifOuvrir();
      document.getElementById('cn-mail').value = 'pas-une-adresse';
      var toasts = []; var t0 = window.toast; window.toast = function (m, k) { toasts.push(m); };
      await caisseNotifEnvoyerEmail();
      window.toast = t0;
      return toasts;
    });
    assert.ok(r.some(function (m) { return /invalide/.test(m); }));
  } finally { await app.fermer(); }
});
