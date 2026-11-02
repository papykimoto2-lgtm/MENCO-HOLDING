/* Menko — bouton « afficher / masquer » sur tous les champs mot de passe.
   Fonctionne aussi pour les champs créés dynamiquement (modales, formulaires
   injectés). Pour exclure un champ : attribut data-nopw. Les champs déjà
   équipés d'un bouton propre (data-nopw ou dans .pw-wrap) sont ignorés. */
(function () {
  'use strict';
  var OPEN = '👁', SHUT = '🙈';

  function wrapInput(inp) {
    if (inp.getAttribute('data-pw-done') || inp.hasAttribute('data-nopw') || (inp.closest && inp.closest('.pw-wrap'))) return;
    inp.setAttribute('data-pw-done', '1');
    var parent = inp.parentNode; if (!parent) return;

    var cs = getComputedStyle(inp);
    var pcs = getComputedStyle(parent);
    var inFlex = /flex/.test(pcs.display);
    var w = cs.width, pct = /%$/.test(w);
    var full = pct;
    if (!full && /px$/.test(w)) {
      var pw = parent.clientWidth;
      full = pw > 0 && Math.abs(parseFloat(w) - pw) < 4;
    }

    var wrap = document.createElement('span');
    wrap.className = 'pw-wrap2';
    var st = 'position:relative;box-sizing:border-box;';
    st += (full || inFlex) ? 'display:block;' : 'display:inline-block;max-width:100%;';
    if (pct) st += 'width:' + w + ';';
    if (inFlex) st += 'flex:' + cs.flexGrow + ' ' + cs.flexShrink + ' ' + cs.flexBasis + ';min-width:0;';
    st += 'margin:' + cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft + ';';
    if (cs.verticalAlign && cs.verticalAlign !== 'baseline') st += 'vertical-align:' + cs.verticalAlign + ';';
    wrap.style.cssText = st;

    parent.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    inp.style.margin = '0';
    if (pct || full) inp.style.width = '100%';
    inp.style.boxSizing = 'border-box';
    inp.style.paddingRight = '2.6rem';

    var b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('aria-label', 'Afficher le mot de passe');
    b.title = 'Afficher / masquer';
    b.textContent = OPEN;
    b.style.cssText = 'position:absolute;right:2px;top:50%;transform:translateY(-50%);background:none;border:none;' +
      'cursor:pointer;font-size:17px;line-height:1;padding:6px 8px;color:inherit;opacity:.65;width:auto;height:auto;min-width:0;margin:0;';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); }); /* garde le focus du champ */
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? SHUT : OPEN;
      b.style.opacity = show ? '1' : '.65';
      b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
    wrap.appendChild(b);
  }

  function scan() {
    var list = document.querySelectorAll('input[type="password"]:not([data-pw-done]):not([data-nopw])');
    for (var i = 0; i < list.length; i++) { try { wrapInput(list[i]); } catch (e) {} }
  }

  var timer = null;
  function later() { if (timer) return; timer = setTimeout(function () { timer = null; scan(); }, 80); }

  function start() {
    scan();
    if (window.MutationObserver) new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
