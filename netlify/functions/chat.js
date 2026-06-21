// Netlify Function : proxy vers l'API Anthropic
// Gère DEUX formats d'appel venant du front :
// 1) Legacy → { prompt, maxTokens }
// 2) Conversational → { systemPrompt, messages, maxTokens, conversational:true }
// + Prompt caching sur le system prompt (réduction de coût sur les tours longs)
// + Lecture de réponse blindée (ne casse plus si la structure change)
// + Rate limiting anti-abus (Supabase)

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
  if (await shouldBlock(event, 'chat', 25, 60) || await shouldBlock(event, 'chat', 300, 3600)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Trop de requêtes, réessaie dans un instant.' }) };
  }

  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Clé API manquante dans les variables Netlify' })
      };
    }

    const payload = JSON.parse(event.body || '{}');
    const {
      prompt, // format legacy
      systemPrompt, // format conversational
      messages, // format conversational : [{role:'user'|'assistant', content:'...'}]
      maxTokens
    } = payload;

    // --- Détection du format ---
    // Si un tableau `messages` est fourni → mode conversationnel.
    // Sinon → mode legacy avec un simple `prompt`.
    const isConversational = Array.isArray(messages) && messages.length > 0;

    let finalMessages;
    let finalSystem = null;

    if (isConversational) {
      finalMessages = messages;
      if (systemPrompt && systemPrompt.trim()) {
        // System sous forme de bloc → permet le prompt caching.
        finalSystem = [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ];
      }
    } else {
      // Legacy : on transforme le prompt en un message user unique.
      if (!prompt || !prompt.trim()) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Requête vide : ni "prompt" ni "messages" fournis.' })
        };
      }
      finalMessages = [{ role: 'user', content: prompt }];
    }

    // Chaîne de modèles : on tente dans l'ordre, fallback si l'un échoue.
    const MODELS = [
      'claude-haiku-4-5-20251001',
      'claude-haiku-4-5',
      'claude-3-haiku-20240307'
    ];

    let lastError = null;

    for (const model of MODELS) {
      const body = {
        model,
        max_tokens: maxTokens || 600,
        messages: finalMessages
      };
      if (finalSystem) body.system = finalSystem;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();

        // Lecture blindée : on cherche le premier bloc de type "text"
        // au lieu de supposer que c'est content[0].
        const textBlock = Array.isArray(data.content)
          ? data.content.find(b => b && b.type === 'text')
          : null;
        const text = textBlock && typeof textBlock.text === 'string'
          ? textBlock.text
          : '';

        if (!text) {
          // Réponse OK mais sans texte exploitable → on essaie le modèle suivant.
          lastError = `Model ${model} → réponse sans bloc texte`;
          continue;
        }

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            // Infos utiles pour suivre le coût / le cache (facultatif côté front)
            usage: data.usage || null,
            model
          })
        };
      }

      const errText = await response.text();
      lastError = `Model ${model} → ${response.status}: ${errText}`;

      // 401 = mauvaise clé : inutile de tenter les autres modèles.
      if (response.status === 401) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            error: 'Clé API Anthropic invalide ou expirée. Vérifiez Netlify > Environment variables > ANTHROPIC_API_KEY.'
          })
        };
      }
    }

    return { statusCode: 500, body: JSON.stringify({ error: lastError }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
