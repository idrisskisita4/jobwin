// Vérifie en LECTURE SEULE qu'une session Stripe Checkout est réellement payée.
// Utilisé uniquement pour l'événement « Purchase » du pixel Meta.
// Ne modifie rien chez Stripe, ne touche ni au webhook ni à l'envoi du code d'accès.
// Ne renvoie aucune donnée personnelle (pas d'email, pas de nom) : seulement payé/non payé, montant, pack.
// Variable d'environnement : STRIPE_READ_KEY (clé restreinte Stripe, droit « Checkout Sessions : lecture »).

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const no = (code = 200) => ({ statusCode: code, headers, body: JSON.stringify({ paid: false }) });
  try {
    if (event.httpMethod !== 'GET') return no(405);
    const sid = (event.queryStringParameters || {}).session_id || '';
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sid)) return no(400);
    const key = process.env.STRIPE_READ_KEY;
    if (!key) return no(200); // pas configuré : on ne confirme rien (aucun Purchase envoyé)

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), {
      headers: { Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return no(200);
    const s = await r.json();

    const paid = s && s.status === 'complete' && s.payment_status === 'paid';
    if (!paid || (s.currency || '').toLowerCase() !== 'eur') return no(200);

    const cents = Number(s.amount_total) || 0;
    // Même logique de détection que le webhook (montant en centimes)
    const pack = cents <= 1100 ? 'Decouverte' : cents <= 2500 ? 'Essentiel' : 'Intensif';
    return { statusCode: 200, headers, body: JSON.stringify({ paid: true, value: Math.round(cents) / 100, currency: 'EUR', pack }) };
  } catch (e) {
    return no(200);
  }
};
