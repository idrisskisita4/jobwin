/* Jobwin — offre Black Friday 2026 : −30 % sur les packs Essentiel et Intensif,
   jusqu'au lundi 30 novembre 2026 à 23h59 (heure de Paris).

   Chargé dans <head>, avant le reste de la page. Pendant l'offre :
   - ajoute la classe « jw-bf » sur <html> : les éléments .bf-on (prix promo, bandeau) s'affichent,
     les éléments .bf-off (prix normaux) se cachent ;
   - remplace les liens de paiement Essentiel et Intensif par les liens promo ;
   - fait tourner les comptes à rebours [data-bf-count].
   À la date de fin, tout revient seul aux prix et liens normaux, même sur une page restée ouverte.
   Hors offre, ou si ce fichier ne se charge pas, le site reste aux prix normaux, avec les liens normaux. */
(function () {
  var END = Date.parse('2026-11-30T23:59:59+01:00'); // lundi 30/11/2026, 23h59:59 à Paris

  // lien de paiement normal → lien promo (identifiants buy.stripe.com/…)
  var LINKS = {
    '28E7sN8el1678cnenE8bS03': { slug: '8x23cx0LT6qr78jdjA8bS04', n: 'Essentiel', p: '13,90 €', old: '19,90 €', e: 8, value: 13.90 },
    '7sY9AV5297uv3W7bbs8bS00': { slug: '6oU6oJ66d3efgIT6Vc8bS05', n: 'Intensif', p: '24,40 €', old: '34,90 €', e: 20, value: 24.40 }
  };

  var std, packs = {};
  for (std in LINKS) {
    if (!/^[A-Za-z0-9]{12,40}$/.test(LINKS[std].slug)) return; // liens promo pas encore renseignés : aucune offre affichée
    packs[LINKS[std].slug] = LINKS[std];
  }
  // Pour jw-checkout.js (fenêtre avant paiement) et jw-track.js (mesure) : un lien promo reste reconnu même après la fin
  window.JW_PROMO = { end: END, packs: packs };

  var root = document.documentElement;
  function active() { return Date.now() < END; }
  if (!active()) return;
  root.classList.add('jw-bf');

  function swap(on) {
    for (var s in LINKS) {
      var from = on ? s : LINKS[s].slug, to = on ? LINKS[s].slug : s, i, el;
      var links = document.querySelectorAll('a[href*="buy.stripe.com/' + from + '"]');
      for (i = 0; i < links.length; i++) { el = links[i]; el.setAttribute('href', el.getAttribute('href').split(from).join(to)); }
      var clickable = document.querySelectorAll('[onclick*="buy.stripe.com/' + from + '"]');
      for (i = 0; i < clickable.length; i++) { el = clickable[i]; el.setAttribute('onclick', el.getAttribute('onclick').split(from).join(to)); }
    }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function left() {
    var s = Math.max(0, Math.floor((END - Date.now()) / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return 'Fin dans ' + d + ' j ' + pad(h) + ' h ' + pad(m) + ' min';
    return 'Fin dans ' + pad(h) + ' h ' + pad(m) + ' min ' + pad(s % 60) + ' s';
  }

  var timer = null;
  function finish() {
    if (timer) clearInterval(timer);
    root.classList.remove('jw-bf');
    try { swap(false); } catch (e) {}
  }
  function tick() {
    if (!active()) { finish(); return; }
    var c = document.querySelectorAll('[data-bf-count]');
    for (var i = 0; i < c.length; i++) c[i].textContent = left();
  }

  function start() {
    // Si les liens ne peuvent pas être remplacés, on n'affiche pas les prix promo (affichage et paiement restent cohérents)
    try { swap(true); } catch (e) { root.classList.remove('jw-bf'); return; }
    tick();
    timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
