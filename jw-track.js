/* Jobwin — consentement cookies + Pixel Meta
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
      '#jw-cc{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;background:#0F1B33;color:#E2E8F0;' +
      'border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:16px 16px 14px;font:14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#jw-cc b{color:#fff;font-size:15px}#jw-cc p{margin:6px 0 12px;color:#CBD5E1;font-size:13.5px}' +
      '#jw-cc .r{display:flex;gap:8px}#jw-cc button{flex:1;border:0;border-radius:10px;padding:11px 10px;font:700 14px/1 inherit;cursor:pointer;font-family:inherit}' +
      '#jw-cc .a{background:#2563EB;color:#fff}#jw-cc .d{background:#fff;color:#0F1B33}' +
      '#jw-cc a{color:#93C5FD}#jw-toast{position:fixed;left:12px;right:12px;top:12px;z-index:2147483001;max-width:560px;margin:0 auto;background:#065F46;color:#fff;' +
      'border-radius:14px;padding:14px 16px;font:600 14px/1.45 Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.3)}';
    document.head.appendChild(s);
  }

  function showBanner() {
    if (document.getElementById('jw-cc')) return;
    css();
    var d = document.createElement('div'); d.id = 'jw-cc'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookies');
    d.innerHTML = '<b>Cookies publicitaires</b>' +
      '<p>Avec ton accord, nous utilisons le pixel Meta (Facebook, Instagram) pour mesurer l’efficacité de nos publicités. ' +
      'Ton CV, tes réponses et tes coordonnées ne sont jamais transmis. Tu peux changer d’avis à tout moment via « Cookies » en bas de page.</p>' +
      '<div class="r"><button type="button" class="d" id="jw-cc-no">Refuser</button><button type="button" class="a" id="jw-cc-yes">Accepter</button></div>';
    document.body.appendChild(d);
    document.getElementById('jw-cc-yes').onclick = function () { decide(true); };
    document.getElementById('jw-cc-no').onclick = function () { decide(false); };
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
    '8x228t0LTbKLakv1AS8bS01': { name: 'Essentiel', value: null }, // prix promo jusqu'au 15/10 inclus
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
