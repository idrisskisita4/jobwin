exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, maxTokens } = JSON.parse(event.body);
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Clé API manquante' }) };
    }

    // Models available on Niveau 1 — newest first
    const MODELS = [
      'claude-haiku-4-5-20251001',
      'claude-haiku-4-5',
      'claude-3-5-haiku-20241022',
      'claude-3-5-haiku-latest'
    ];

    for (const model of MODELS) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens || 600,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.content[0].text })
        };
      }

      const errData = await response.json().catch(() => ({}));
      // not_found = model doesn't exist, try next
      if (errData?.error?.type === 'not_found_error') continue;
      // 401 = bad key, stop immediately
      if (response.status === 401) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Clé API invalide' }) };
      }
      // other errors — try next model
    }

    return { statusCode: 500, body: JSON.stringify({ error: 'Aucun modèle disponible' }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
