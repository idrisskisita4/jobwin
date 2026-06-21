// netlify/functions/deepgram-token.js
// Génère un jeton temporaire Deepgram (JWT court, ~30s) pour la transcription
// côté navigateur. La vraie clé Deepgram (DEEPGRAM_API_KEY) reste sur le serveur
// et n'est JAMAIS envoyée au front. Le navigateur ne reçoit qu'un jeton jetable
// qui n'a besoin d'être valide que le temps d'ouvrir la connexion WebSocket.
// + Rate limiting anti-abus (Supabase).

// --- Rate limiting (anti-abus) ---------------------------------------------
// Renvoie TRUE si la requête doit être BLOQUÉE. Fail-open : en cas d'erreur
// ou de config manquante, on laisse passer pour ne jamais casser le produit.
async function shouldBlock(event, name, limit, windowSec) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return false;
    const xff = event.headers['x-forwarded-for']
      || event.headers['client-ip']
      || event.headers['x-nf-client-connection-ip']
      || 'unknown';
    const ip = String(xff).split(',')[0].trim();
    const r = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_bucket: `${name}:${windowSec}:${ip}`,
        p_limit: limit,
        p_window_seconds: windowSec
      })
    });
    if (!r.ok) return false;
    const allowed = await r.json();
    return allowed === false;
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Deux limites : rafale (par minute) + plafond horaire, par IP.
  if (await shouldBlock(event, 'dg', 15, 60) || await shouldBlock(event, 'dg', 120, 3600)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Trop de requêtes, réessaie dans un instant.' }) };
  }

  try {
    const KEY = process.env.DEEPGRAM_API_KEY;
    if (!KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'DEEPGRAM_API_KEY manquante dans les variables Netlify' })
      };
    }

    // Endpoint officiel de génération de jeton temporaire (token-based auth).
    // La doc impose un corps VIDE {} ; le TTL par défaut (30s) suffit pour ouvrir le WebSocket.
    const resp = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + KEY.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: 'Echec de génération du jeton Deepgram', detail })
      };
    }

    const data = await resp.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in
      })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
