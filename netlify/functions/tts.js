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
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/' + voice_id + '/stream',
      {
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': KEY },
        body: JSON.stringify(elBody)
      }
    );
    if (!response.ok) return { statusCode: response.status, body: await response.text() };
    const buffer = await response.arrayBuffer();
    return { statusCode: 200, headers: {'Content-Type':'audio/mpeg'}, body: Buffer.from(buffer).toString('base64'), isBase64Encoded: true };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
