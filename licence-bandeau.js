/* Bandeau licence — facture impayée. Rouge, visible de tous, NON bloquant (aucun
   verrou sur le logiciel). Chargé uniquement par les applications Menko
   (menko-immo.html, menko-agro.html) ; aucune autre page ne l'inclut.

   Données : CONFIG ci-dessous. Le montant n'est JAMAIS affiché (bandeau vu de
   tous les utilisateurs). Pour lever le bandeau : actif:false (ou échéance
   vide). Aperçu de test : ?licence_preview=1&jours=100 (sans effet sur CONFIG).
   Tout texte est posé via textContent (anti-XSS). */
(function () {
  'use strict';

  var CONFIG = {
    actif: true,
    echeance: '2026-08-01',   /* date d'échéance de la facture (AAAA-MM-JJ) — à ajuster */
    numero: '',               /* n° de facture ; vide = message générique */
    contact: ''               /* ex. « compta@… · +225 … » ; vide = ligne masquée */
  };

  var CSS =
    '#lic-bandeau{display:none;flex-shrink:0;background:#c0151b;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);position:relative;z-index:101}' +
    '#lic-bandeau.on{display:block}' +
    '#lic-bandeau.grave{background:#7f0d11}' +
    '#lic-bandeau .lic-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 14px}' +
    '#lic-bandeau .lic-msg{flex:1 1 240px;font-size:13px;font-weight:600}' +
    '#lic-bandeau.grave .lic-msg{font-size:14px}' +
    '#lic-bandeau .lic-act{display:flex;gap:8px;flex-wrap:wrap}' +
    '#lic-bandeau button{min-height:36px;padding:0 12px;border:0;border-radius:6px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
    '#lic-bandeau .lic-p{background:#fff;color:#a00f14}' +
    '#lic-bandeau .lic-s{background:rgba(255,255,255,.18);color:#fff}' +
    '#lic-bandeau .lic-panel{display:none;background:#fff;color:#1a2430;border-top:3px solid #7f0d11;max-height:55vh;overflow:auto}' +
    '#lic-bandeau .lic-panel.open{display:block}' +
    '#lic-bandeau .lic-in{padding:12px 16px}' +
    '#lic-bandeau .lic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;font-size:13px}' +
    '#lic-bandeau h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6876}' +
    '#lic-bandeau ol,#lic-bandeau ul{margin:0;padding-left:18px}' +
    '#lic-bandeau li{margin:3px 0}' +
    '#lic-bandeau .lic-tl{list-style:none;padding:0}' +
    '#lic-bandeau .lic-tl li{display:flex;gap:10px;padding:4px 0;border-bottom:1px solid #e3e7eb}' +
    '#lic-bandeau .lic-tl .j{flex:0 0 52px;font-weight:700}' +
    '#lic-bandeau .lic-tl .done{color:#1f7a3d}' +
    '#lic-bandeau .lic-tl .now{color:#c0151b;font-weight:700}' +
    '#lic-bandeau .lic-note{margin-top:10px;padding:7px 10px;border-left:4px solid #1f7a3d;background:#f1f5f2;font-size:12px}' +
    /* Menko Agro : bandeau collé en haut, sous la barre mobile ; la barre latérale (100vh) en tient compte */
    '#lic-bandeau.sticky{position:sticky;top:0}' +
    '@media(max-width:767px){#lic-bandeau.sticky{top:var(--mob-top,0px)}}' +
    '@media(min-width:768px){html.lic-agro .sidebar{top:var(--lic-h,0px)!important;height:calc(100vh - var(--lic-h,0px))!important}}';

  var ETAPES = [
    [15, 'Avertissement, support suspendu'],
    [30, 'Mode lecture seule'],
    [45, 'Création de documents bloquée'],
    [60, 'Licence suspendue (export seul)'],
    [90, 'Recouvrement (injonction de payer)']
  ];

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function liste(tag, items) {
    var l = el(tag);
    items.forEach(function (n) {
      var li = el('li');
      if (typeof n === 'string') li.textContent = n; else n.forEach(function (x) { li.append(x); });
      l.appendChild(li);
    });
    return l;
  }
  function section(titre, noeud) {
    var s = el('section');
    s.append(el('h4', null, titre), noeud);
    return s;
  }

  function jours() {
    var q = location.search, p = /[?&]licence_preview=1/.test(q);
    if (p) { var m = q.match(/[?&]jours=(\d+)/); return m ? +m[1] : 12; }
    if (!CONFIG.actif || !CONFIG.echeance) return 0;
    var d = new Date(CONFIG.echeance + 'T00:00:00');
    if (isNaN(d)) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function construire(n) {
    var grave = n > 90;
    var num = CONFIG.numero;
    var b = el('div'); b.id = 'lic-bandeau'; b.setAttribute('role', 'alert'); b.setAttribute('aria-live', 'polite');
    if (grave) b.classList.add('grave');

    var msg = el('div', 'lic-msg');
    var qui = num ? [el('b', null, num), ' impayée depuis '] : ['impayée depuis '];
    if (grave) msg.append.apply(msg, ['Facture '].concat(qui, [el('b', null, 'plus de 3 mois'), '. Régularisation urgente requise.']));
    else msg.append.apply(msg, ['Paiement en retard : facture '].concat(qui, [el('b', null, n + ' jours'), '. Merci de régulariser.']));

    var bPay = el('button', 'lic-p', 'Régulariser'); bPay.type = 'button';
    var bTog = el('button', 'lic-s', 'Voir la procédure'); bTog.type = 'button';
    bTog.setAttribute('aria-expanded', 'false'); bTog.setAttribute('aria-controls', 'lic-panel');
    var act = el('div', 'lic-act'); act.append(bPay, bTog);
    var bar = el('div', 'lic-bar'); bar.append(el('span', null, '⚠'), msg, act);
    bar.firstChild.setAttribute('aria-hidden', 'true');

    var ref = num ? ['Indiquer la référence ', el('b', null, num), '.'] : ['Indiquer la référence de la facture.'];
    var etapes = el('ul', 'lic-tl'), marque = false;
    ETAPES.forEach(function (s) {
      var li = el('li'); li.append(el('span', 'j', 'J+' + s[0]), el('span', null, s[1]));
      if (n >= s[0]) li.classList.add('done'); else if (!marque) { li.classList.add('now'); marque = true; }
      etapes.appendChild(li);
    });
    var aide = [
      'Erreur ou litige : contester sous 5 jours ouvrés.',
      'Échéancier : demande écrite à la comptabilité.'
    ];
    if (CONFIG.contact) aide.push(CONFIG.contact);

    var grid = el('div', 'lic-grid');
    grid.append(
      section('1. Régulariser', liste('ol', [
        num ? ['Ouvrir la facture ', el('b', null, num), '.'] : 'Retrouver la facture auprès de la comptabilité.',
        'Payer par virement, Mobile Money ou chèque.',
        ref,
        'Envoyer la preuve à la comptabilité.'
      ])),
      section('2. Étapes à venir', etapes),
      section('3. Aide', liste('ul', aide))
    );
    var inn = el('div', 'lic-in');
    inn.append(grid, el('div', 'lic-note', "Le logiciel reste pleinement utilisable. Aucune donnée n'est supprimée."));
    var panel = el('div', 'lic-panel'); panel.id = 'lic-panel'; panel.append(inn);
    b.append(bar, panel);

    bTog.onclick = function () {
      var o = panel.classList.toggle('open');
      bTog.setAttribute('aria-expanded', o);
      bTog.textContent = o ? 'Masquer la procédure' : 'Voir la procédure';
      maj();
    };
    bPay.onclick = function () { if (!panel.classList.contains('open')) bTog.click(); };
    return b;
  }

  function maj() { /* hauteur du bandeau → barre latérale Agro */
    var b = document.getElementById('lic-bandeau');
    if (b) document.documentElement.style.setProperty('--lic-h', b.offsetHeight + 'px');
  }

  function monter() {
    var n = jours();
    if (!(n > 0) || document.getElementById('lic-bandeau')) return;
    var app = document.getElementById('app');          /* Menko Immo : bandeau dans la coquille, en tête */
    var agro = document.querySelector('.app-shell');   /* Menko Agro : avant la coquille */
    if (!app && !agro) return;
    var st = el('style'); st.textContent = CSS; document.head.appendChild(st);
    var b = construire(n); b.classList.add('on');
    if (app) app.insertBefore(b, app.firstChild);
    else { b.classList.add('sticky'); document.documentElement.classList.add('lic-agro'); agro.parentNode.insertBefore(b, agro); }
    maj(); window.addEventListener('resize', maj);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();
})();
