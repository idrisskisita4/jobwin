// netlify/functions/save-feedback.js
// Enregistre un retour utilisateur privé dans la table funnel_events (Supabase).
// Variables d'env requises : SUPABASE_URL, SUPABASE_SERVICE_KEY
// (la clé SERVICE, pas la clé publique — l'écriture passe côté serveur)

const ALLOWED_ORIGINS = [
  'https://jobwin.fr',
  'https://www.jobwin.fr',
  'https://spontaneous-fudge-9adda1.netlify.app'
];

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const cors = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[save-feedback] Config Supabase manquante');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Config error' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const message = String(payload.message || '').trim().slice(0, 1000);
  if (!message) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Message vide' }) };

  const row = {
    event: 'feedback',
    email: String(payload.email || '').slice(0, 200) || null,
    meta: {
      message,
      score: String(payload.score || ''),
      poste: String(payload.poste || '').slice(0, 200)
    }
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/funnel_events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!res.ok) {
      const t = await res.text();
      console.error('[save-feedback] Supabase', res.status, t);
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Save failed' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[save-feedback] Exception:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server error' }) };
  }
};
