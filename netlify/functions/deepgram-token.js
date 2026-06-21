// netlify/functions/deepgram-token.js
// Génère un jeton temporaire Deepgram (JWT court, ~60s) pour la transcription
// côté navigateur. La vraie clé Deepgram (DEEPGRAM_API_KEY) reste sur le serveur
// et n'est JAMAIS envoyée au front. Le navigateur ne reçoit qu'un jeton jetable
// qui n'a besoin d'être valide que le temps d'ouvrir la connexion WebSocket.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
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
