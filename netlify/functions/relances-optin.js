// netlify/functions/relances-optin.js
// Enregistre l'accord pour les 3 emails de conseils (case cochée sur l'écran de score du Pré-entretien).
// Sans case cochée, cette fonction n'est jamais appelée. Envois : relances-envoi.js. Désinscription : relances-desinscription.js.
// Table Supabase attendue : email_relances (créée une fois avec le SQL fourni à Idriss).
// Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY

const ALLOWED_ORIGINS = [
  'https://jobwin.fr',
  'https://www.jobwin.fr',
  'https://warm-churros-05b176.netlify.app'
];
const CONSENT_VERSION = 'case-ecran-score-v1'; // texte de la case affichée au moment de l'accord (preuve du consentement)
const DAY = 24 * 60 * 60 * 1000;

// Anti-abus : 5 inscriptions par heure et par adresse IP (même mécanisme que tts.js). Fail-open.
async function rateLimited(event, url, key) {
  try {
    const xff = event.headers['x-forwarded-for'] || event.headers['client-ip'] || event.headers['x-nf-client-connection-ip'] || 'unknown';
    const ip = String(xff).split(',')[0].trim();
    const r = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: `optin:3600:${ip}`, p_limit: 5, p_window_seconds: 3600 })
    });
    if (!r.ok) return false;
    return (await r.json()) === false;
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  const reply = (statusCode, obj) => ({ statusCode, headers: cors, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { ok: false, error: 'Origine refusée' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'JSON invalide' }); }

  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { ok: false, error: 'Email invalide' });
  const n = Math.round(Number(body.score));
  const score = Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  const poste = String(body.poste || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 120) || null;

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('[relances-optin] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquante'); return reply(200, { ok: false }); }
  if (await rateLimited(event, url, key)) return reply(429, { ok: false, error: 'Trop de demandes, réessaie plus tard.' });

  // Nouvel accord = nouvelle série : on (re)part de zéro. Le jeton de désinscription existant est conservé.
  const now = Date.now();
  const row = {
    email,
    consent_at: new Date(now).toISOString(),
    consent_version: CONSENT_VERSION,
    score,
    poste,
    step: 0,
    fails: 0,
    next_at: new Date(now + DAY).toISOString(),
    last_sent_at: null,
    unsubscribed_at: null,
    purchased_at: null
  };
  try {
    const res = await fetch(`${url}/rest/v1/email_relances?on_conflict=email`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      // Table pas encore créée (SQL à lancer dans Supabase) ou autre souci : on ne casse rien côté visiteur.
      console.error('[relances-optin] enregistrement impossible', res.status, (await res.text()).slice(0, 300));
      return reply(200, { ok: false });
    }
    return reply(200, { ok: true });
  } catch (e) {
    console.error('[relances-optin] exception', e.message);
    return reply(200, { ok: false });
  }
};
