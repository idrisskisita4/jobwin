/* Jobwin — consentement cookies + Pixel Meta + avertissement navigateur intégré (Instagram/Facebook)
   - Rien n'est chargé ni envoyé à Meta avant un clic sur « Accepter ».
   - Aucune donnée personnelle (CV, réponses, email, nom) n'est transmise : seulement le type d'événement,
     le pack et le montant.
   - Purchase n'est envoyé qu'après vérification serveur auprès de Stripe (paiement réellement payé),
     une seule fois par session de paiement. */
(function () {
  'use strict';
  var PIXEL_ID = '1899463654700183';
  var KEY = 'jw_consent_v1'; // {ads:true|false, t:timestamp}
  var MAX_AGE = 1000 * 60 * 60 * 24 * 180; // on redemande au bout de 6 mois
  var queue = []; // événements en attente du consentement
  var loaded = false;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }

  function readConsent() {
    try {
      var c = JSON.parse(store(KEY) || 'null');
      if (!c || typeof c.ads !== 'boolean' || !c.t || Date.now() - c.t > MAX_AGE) return null;
      return c.ads;
    } catch (e) { return null; }
  }

  /* ---------- Pixel ---------- */
  function loadPixel() {
    if (loaded) return; loaded = true;
    /* Code officiel Meta (sans la balise <noscript>, qui contournerait le consentement) */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    // Pas de collecte automatique (textes de boutons, champs de formulaire…)
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    var q = queue; queue = [];
    q.forEach(function (a) { send(a[0], a[1], a[2], a[3]); });
  }

  function send(kind, name, params, opts) {
    if (!window.fbq) return;
    if (opts) window.fbq(kind, name, params || {}, opts); else window.fbq(kind, name, params || {});
  }

  /* API publique : jwTrack('Lead', {...}) / jwTrack('X', {...}, {eventID}, true) pour un événement personnalisé */
  window.jwTrack = function (name, params, opts, custom) {
    var c = readConsent();
    if (c === false) return; // refusé : on n'envoie rien
    var kind = custom ? 'trackCustom' : 'track';
    if (c === true && loaded) send(kind, name, params, opts);
    else queue.push([kind, name, params, opts]); // en attente du choix
  };

  /* ---------- Bandeau ---------- */
  function css() {
    if (document.getElementById('jw-cc-css')) return;
    var s = document.createElement('style'); s.id = 'jw-cc-css';
    s.textContent =
      '#jw-dock{position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483000;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:8px;pointer-events:none}' +
      '#jw-dock>*{pointer-events:auto}' +
      '#jw-cc{background:#0F1B33;color:#E2E8F0;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.3);padding:11px 12px 11px;font:13px/1.4 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#jw-cc p{margin:0 0 9px;color:#CBD5E1;font-size:12.5px}#jw-cc p b{color:#fff}' +
      '#jw-cc .r{display:flex;gap:8px}#jw-cc button{flex:1;border:0;border-radius:9px;padding:9px 10px;font:700 13.5px/1 inherit;cursor:pointer;font-family:inherit}' +
      '#jw-cc .a{background:#2563EB;color:#fff}#jw-cc .d{background:#fff;color:#0F1B33}' +
      '#jw-ia{background:#FFF7E6;color:#3B2A05;border:1.5px solid #F5C451;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.18);padding:12px 38px 12px 14px;font:13px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;position:relative}' +
      '#jw-ia b{display:block;font-size:14px;color:#1F1600;margin-bottom:3px}#jw-ia .x{position:absolute;right:8px;top:6px;border:0;background:none;font-size:20px;line-height:1;color:#8A6D1E;cursor:pointer;padding:4px}' +
      '#jw-ia .r{display:flex;gap:8px;margin-top:9px}#jw-ia .r button{flex:1;border:0;border-radius:9px;padding:10px 8px;font:700 13.5px/1 Inter,system-ui,sans-serif;cursor:pointer;background:#1B2E4A;color:#fff}' +
      '#jw-ia .r button.s{background:#fff;color:#1B2E4A;border:1.5px solid #E5D3A0}' +
      '#jw-toast{position:fixed;left:12px;right:12px;top:12px;z-index:2147483001;max-width:560px;margin:0 auto;background:#065F46;color:#fff;' +
      'border-radius:14px;padding:14px 16px;font:600 14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.3)}';
    document.head.appendChild(s);
  }

  function dock() {
    var d = document.getElementById('jw-dock');
    if (!d) {
      css(); d = document.createElement('div'); d.id = 'jw-dock'; document.body.appendChild(d);
      // Réserve la place du dock en bas de page : rien du site ne reste caché dessous
      var base = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      setInterval(function () {
        var h = d.offsetHeight ? d.offsetHeight + 20 : 0;
        document.body.style.paddingBottom = (base + h) + 'px';
      }, 300);
    }
    return d;
  }

  function showBanner() {
    if (document.getElementById('jw-cc')) return;
    css();
    var d = document.createElement('div'); d.id = 'jw-cc'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookies');
    d.innerHTML = '<p><b>Cookies pub.</b> Avec ton accord, on mesure nos pubs Meta. Ton CV et tes réponses ne sont jamais transmis. Modifiable via « Cookies » en bas de page.</p>' +
      '<div class="r"><button type="button" class="d" id="jw-cc-no">Refuser</button><button type="button" class="a" id="jw-cc-yes">Accepter</button></div>';
    dock().appendChild(d);
    document.getElementById('jw-cc-yes').onclick = function () { decide(true); };
    document.getElementById('jw-cc-no').onclick = function () { decide(false); };
  }

  /* ---------- Navigateur intégré (Instagram, Facebook, TikTok…) ----------
     Le micro y est souvent bloqué : on propose d'ouvrir Jobwin dans le vrai navigateur. */
  var UA = navigator.userAgent || '';
  var IA = /Instagram/i.test(UA) ? 'Instagram' : /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(UA) ? 'Facebook' : /Messenger/i.test(UA) ? 'Messenger' :
    /LinkedInApp/i.test(UA) ? 'LinkedIn' : /musical_ly|TikTok|BytedanceWebview/i.test(UA) ? 'TikTok' : /Snapchat/i.test(UA) ? 'Snapchat' : '';
  var ANDROID = /Android/i.test(UA);
  function showInApp() {
    if (!IA || document.getElementById('jw-ia')) return;
    try { if (sessionStorage.getItem('jw_ia_x')) return; } catch (e) {}
    // Un seul bandeau à la fois : on attend que le choix cookies soit fait
    if (document.getElementById('jw-cc')) { setTimeout(showInApp, 500); return; }
    var url = 'https://jobwin.fr' + location.pathname + location.search;
    var d = document.createElement('div'); d.id = 'jw-ia'; d.setAttribute('role', 'note');
    d.innerHTML = '<button type="button" class="x" aria-label="Fermer">×</button>' +
      '<b>🎙️ Le micro peut être bloqué dans ' + IA + '</b>' +
      (ANDROID ? 'Pour ton entretien à l’oral, ouvre Jobwin dans Chrome.'
               : 'Ouvre Jobwin dans Safari : touche <b style="display:inline;font-size:13px">⋯</b> en haut à droite → « Ouvrir dans le navigateur ».') +
      '<div class="r">' + (ANDROID ? '<button type="button" id="jw-ia-open">Ouvrir dans Chrome</button>' : '') +
      '<button type="button" class="' + (ANDROID ? 's' : '') + '" id="jw-ia-copy">Copier le lien</button></div>';
    var dk = dock(); dk.insertBefore(d, dk.firstChild);
    d.querySelector('.x').onclick = function () { d.remove(); try { sessionStorage.setItem('jw_ia_x', '1'); } catch (e) {} };
    var op = document.getElementById('jw-ia-open');
    if (op) op.onclick = function () { location.href = 'intent://' + url.replace(/^https:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end'; };
    document.getElementById('jw-ia-copy').onclick = function () {
      var btn = this, done = function () { btn.textContent = 'Lien copié ✓ Colle-le dans ' + (ANDROID ? 'Chrome' : 'Safari'); };
      try { navigator.clipboard.writeText(url).then(done, fallback); } catch (e) { fallback(); }
      function fallback() { var t = document.createElement('input'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = url; } t.remove(); }
    };
    // Pendant l'entretien lui-même, on n'encombre pas l'écran (le bouton micro est en bas)
    setInterval(function () {
      var busy = !!document.querySelector('#screen-interview.active,#screen-brief.active,#screen-results.active');
      d.style.display = busy ? 'none' : '';
    }, 400);
  }

  function decide(ads) {
    store(KEY, JSON.stringify({ ads: ads, t: Date.now() }));
    var b = document.getElementById('jw-cc'); if (b) b.remove();
    if (ads) { loadPixel(); checkPurchase(); }
    else { queue = []; }
  }

  /* Lien « Cookies » pour changer d'avis */
  window.jwCookieSettings = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (loaded) { location.reload(); return; } // déjà chargé : on recharge pour repartir propre
    showBanner();
  };

  /* ---------- InitiateCheckout : clic vers un lien de paiement Stripe ---------- */
  var PACKS = {
    'bJecN70LT8yz9grenE8bS02': { name: 'Decouverte', value: 9.90 },
    '28E7sN8el1678cnenE8bS03': { name: 'Essentiel', value: null }, // lien Essentiel 19,90 € (depuis le 16/10)
    '8x228t0LTbKLakv1AS8bS01': { name: 'Essentiel', value: null }, // ancien lien promo 14,90 € (désactivé)
    '7sY9AV5297uv3W7bbs8bS00': { name: 'Intensif', value: 34.90 }
  };
  function essentielPrice() { return Date.now() < new Date('2026-10-16T00:00:00+02:00').getTime() ? 14.90 : 19.90; }
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com"],[onclick*="buy.stripe.com"]') : null;
    if (!el) return;
    var src = (el.getAttribute('href') || '') + ' ' + (el.getAttribute('onclick') || '');
    var m = src.match(/buy\.stripe\.com\/([A-Za-z0-9]+)/); if (!m) return;
    var p = PACKS[m[1]] || { name: 'Inconnu', value: null };
    var value = p.name === 'Essentiel' ? essentielPrice() : p.value;
    var params = { content_name: 'Pack ' + p.name, currency: 'EUR' };
    if (value) params.value = value;
    window.jwTrack('InitiateCheckout', params);
  }, true);

  /* ---------- Purchase : retour de Stripe avec ?session_id=cs_... ---------- */
  function capturePurchaseParam() {
    try {
      var u = new URL(location.href);
      var sid = u.searchParams.get('session_id');
      if (sid && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sid)) {
        sset('jw_pending_purchase', sid);
        u.searchParams.delete('session_id'); u.searchParams.delete('checkout');
        history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash); // URL propre avant tout envoi
        return true;
      }
    } catch (e) {}
    return false;
  }

  function toast(msg) {
    css(); var t = document.createElement('div'); t.id = 'jw-toast'; t.textContent = msg;
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 9000);
  }

  function checkPurchase() {
    var sid = sget('jw_pending_purchase'); if (!sid) return;
    if (readConsent() !== true) return; // sera traité si l'utilisateur accepte
    if (store('jw_purchase_' + sid)) { sset('jw_pending_purchase', null); return; } // déjà envoyé
    fetch('/.netlify/functions/verify-checkout?session_id=' + encodeURIComponent(sid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.paid !== true || typeof j.value !== 'number') return; // non confirmé : rien n'est envoyé
        if (store('jw_purchase_' + sid)) return;
        store('jw_purchase_' + sid, '1');
        sset('jw_pending_purchase', null);
        // eventID = id de session : Meta dédoublonne aussi de son côté
        var pp = { value: j.value, currency: 'EUR' }; if (j.pack) pp.content_name = 'Pack ' + j.pack;
        window.jwTrack('Purchase', pp, { eventID: sid });
      })
      .catch(function () {});
  }

  /* ---------- Démarrage ---------- */
  function start() {
    var fromStripe = capturePurchaseParam();
    if (fromStripe) toast('Paiement reçu, merci ! Ton code d’accès arrive par email dans quelques minutes (pense à vérifier tes spams).');
    var c = readConsent();
    if (c === true) { loadPixel(); checkPurchase(); }
    else if (c === null) showBanner();
    showInApp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
