// netlify/functions/tts.js
// Proxy ElevenLabs (la vraie clé reste côté serveur).
// + Rate limiting anti-abus (Supabase) + log de la concurrence ElevenLabs.

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
    const allowed = await r.json(); // true = autorisé
    return allowed === false; // bloque seulement si explicitement refusé
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Deux limites : rafale (par minute) + plafond horaire, par IP.
  if (await shouldBlock(event, 'tts', 30, 60) || await shouldBlock(event, 'tts', 400, 3600)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Trop de requêtes, réessaie dans un instant.' }) };
  }

  try {
    const voice_id = (event.queryStringParameters && event.queryStringParameters.voice) || 'pNInz6obpgDQGcFmaJgB';
    const body = JSON.parse(event.body);
    const text = body.text || '';
    const model_id = body.model_id || 'eleven_multilingual_v2';
    const voice_settings = body.voice_settings || {stability:0.5,similarity_boost:0.75};
    const KEY = process.env.ELEVENLABS_API_KEY;
    const elBody = {text: text, model_id: model_id, voice_settings: voice_settings};
    if (body.speed) elBody.speed = body.speed;

    const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voice_id + '/stream';
    const opts = {
      method: 'POST',
      headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': KEY },
      body: JSON.stringify(elBody)
    };

    // Retry serveur sur 429 (trop de requêtes) et 5xx transitoires.
    // On absorbe les pics côté serveur pour éviter les coupures de voix côté client.
    // Plafonné à 3 tentatives + max 1,5s d'attente cumulée pour rester sous le timeout Netlify.
    const MAX_ATTEMPTS = 3;
    let response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(url, opts);

      // Log de la concurrence ElevenLabs (visible dans les logs Netlify).
      // Permet de voir en temps réel à quel point on approche du plafond.
      const cur = response.headers.get('current-concurrent-requests');
      const max = response.headers.get('maximum-concurrent-requests');
      if (cur || max) console.log(`[tts] concurrence ElevenLabs: ${cur || '?'}/${max || '?'} (status ${response.status})`);

      if (response.ok) break;
      const retriable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503;
      if (!retriable || attempt === MAX_ATTEMPTS) break;
      const ra = parseInt(response.headers.get('retry-after') || '0', 10);
      const wait = ra > 0 ? Math.min(ra * 1000, 1500) : attempt * 500; // 500ms puis 1000ms
      await new Promise(r => setTimeout(r, wait));
    }

    if (!response.ok) return { statusCode: response.status, body: await response.text() };
    const buffer = await response.arrayBuffer();
    return { statusCode: 200, headers: {'Content-Type':'audio/mpeg'}, body: Buffer.from(buffer).toString('base64'), isBase64Encoded: true };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
