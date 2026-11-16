/* Jobwin — étape avant le paiement Stripe.
   Le client demande à accéder au service tout de suite (article L221-25 du Code de la consommation,
   CGV article 6), puis il part vers la page de paiement Stripe. Sans cette demande, pas de paiement. */
(function () {
  if (window.__jwCheckout) return;
  window.__jwCheckout = true;

  var PACKS = {
    'bJecN70LT8yz9grenE8bS02': { n: 'Découverte', p: '9,90 €', e: 3 },
    '28E7sN8el1678cnenE8bS03': { n: 'Essentiel', p: '19,90 €', e: 8 },
    '7sY9AV5297uv3W7bbs8bS00': { n: 'Intensif', p: '34,90 €', e: 20 }
  };

  var CSS =
    '#jw-co{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);padding:16px;font-family:inherit}' +
    '#jw-co[hidden]{display:none}' +
    '#jw-co .jw-co-card{width:100%;max-width:440px;background:#fff;color:#0f172a;border-radius:18px;padding:22px 20px 18px;box-shadow:0 24px 60px rgba(15,23,42,.35);text-align:left}' +
    '#jw-co .jw-co-k{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#2563EB;margin:0 0 4px}' +
    '#jw-co h2{font-size:20px;line-height:1.25;margin:0 0 2px;color:#1B2E4A}' +
    '#jw-co .jw-co-e{font-size:14px;color:#64748b;margin:0 0 16px}' +
    '#jw-co .jw-co-l{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.45;color:#1e293b;background:#F1F5F9;border-radius:12px;padding:12px;cursor:pointer;margin:0 0 10px}' +
    '#jw-co .jw-co-l input{flex:none;width:20px;height:20px;margin:1px 0 0;accent-color:#2563EB}' +
    '#jw-co .jw-co-s{font-size:13px;color:#64748b;margin:0 0 14px;line-height:1.45}' +
    '#jw-co .jw-co-s a{color:#2563EB}' +
    '#jw-co button{display:block;width:100%;border:0;border-radius:12px;font:inherit;font-size:16px;font-weight:700;padding:14px 16px;cursor:pointer}' +
    '#jw-co #jw-co-go{background:#2563EB;color:#fff}' +
    '#jw-co #jw-co-go[disabled]{background:#CBD5E1;color:#fff;cursor:not-allowed}' +
    '#jw-co #jw-co-x{background:none;color:#64748b;font-weight:600;font-size:14px;padding:12px 16px 2px}' +
    '@media (max-width:520px){#jw-co{align-items:flex-end;padding:0}#jw-co .jw-co-card{max-width:none;border-radius:18px 18px 0 0;padding-bottom:calc(14px + env(safe-area-inset-bottom))}}';

  var box, chk, go, href, lastFocus;

  function build() {
    if (box) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    box = document.createElement('div');
    box.id = 'jw-co';
    box.hidden = true;
    box.innerHTML =
      '<div class="jw-co-card" role="dialog" aria-modal="true" aria-labelledby="jw-co-t">' +
        '<p class="jw-co-k">Avant le paiement</p>' +
        '<h2 id="jw-co-t"></h2>' +
        '<p class="jw-co-e" id="jw-co-e"></p>' +
        '<label class="jw-co-l"><input type="checkbox" id="jw-co-c">' +
          '<span>Je demande à accéder à mon pack tout de suite, sans attendre la fin du délai de rétractation de 14 jours. Si je me rétracte, seuls les entretiens déjà utilisés me seront facturés.</span></label>' +
        '<p class="jw-co-s">En continuant, tu acceptes nos <a href="/cgv.html" target="_blank" rel="noopener">conditions générales de vente</a>. Paiement sécurisé par Stripe.</p>' +
        '<button type="button" id="jw-co-go" disabled>Continuer vers le paiement</button>' +
        '<button type="button" id="jw-co-x">Annuler</button>' +
      '</div>';
    document.body.appendChild(box);
    chk = document.getElementById('jw-co-c');
    go = document.getElementById('jw-co-go');
    chk.addEventListener('change', function () { go.disabled = !chk.checked; });
    document.getElementById('jw-co-x').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    go.addEventListener('click', proceed);
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') { // garde le focus dans la fenêtre
        var f = [].slice.call(box.querySelectorAll('input,a,button')).filter(function (x) { return !x.disabled; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  function open(h) {
    build();
    href = h;
    var m = String(h).match(/buy\.stripe\.com\/([A-Za-z0-9]+)/);
    var p = (m && PACKS[m[1]]) || null;
    document.getElementById('jw-co-t').textContent = p ? 'Pack ' + p.n + ' — ' + p.p : 'Ton pack Jobwin';
    document.getElementById('jw-co-e').textContent = p ? p.e + ' entretiens complets · paiement unique, sans abonnement' : 'Paiement unique, sans abonnement';
    chk.checked = false;
    go.disabled = true;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { try { chk.focus(); } catch (e) {} }, 30);
  }

  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }

  function proceed() {
    if (!chk.checked || !href) return;
    var url = href;
    try {
      var u = new URL(href);
      // Trace de la demande d'accès immédiat, visible dans Stripe (champ client_reference_id)
      u.searchParams.set('client_reference_id', 'acces-immediat-' + Date.now());
      url = u.toString();
    } catch (e) {}
    if (window.jwTrackCheckout) { try { window.jwTrackCheckout(href); } catch (e) {} }
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e) {}
    if (w) { try { w.opener = null; } catch (e) {} close(); }
    else { setTimeout(function () { location.assign(url); }, 250); } // fenêtre bloquée : même onglet
  }

  // Intercepte tous les liens de paiement Stripe, avant tout autre script (phase de capture sur window)
  window.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com"]') : null;
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    open(a.getAttribute('href'));
  }, true);
})();
