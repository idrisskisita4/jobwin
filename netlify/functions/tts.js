exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
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
