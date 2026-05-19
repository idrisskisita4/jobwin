const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, maxTokens = 600, systemPrompt, messages, conversational, pdfBase64 } = body;

    let responseText;

    if (conversational && messages && Array.isArray(messages)) {
      // ── MULTI-TURN MODE ──
      const sys = systemPrompt || "Tu es un recruteur professionnel en entretien d'embauche. Réponds naturellement en français.";

      // Filter instruction messages
      const conversationMessages = messages.filter((m, i) => {
        if (i === messages.length - 1 && m.role === 'user' && m.content.startsWith('[')) return false;
        return m.content && m.content.trim().length > 0;
      });

      const isReactionRequest = messages[messages.length - 1]?.content?.startsWith('[');

      const finalMessages = isReactionRequest
        ? [...conversationMessages, { role: 'user', content: messages[messages.length - 1].content }]
        : conversationMessages;

      const finalSystem = isReactionRequest
        ? sys + "\nRègle absolue : réagis à la dernière réponse du candidat en 1-2 phrases. Ne pose PAS de question. Réagis à un élément précis de sa réponse."
        : sys;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens || 200,
        system: finalSystem,
        messages: finalMessages,
      });

      responseText = response.content[0]?.text || '';

    } else if (pdfBase64) {
      // ── PDF READING MODE ──
      // Claude reads the PDF natively - like reading it directly
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              }
            },
            {
              type: 'text',
              text: `Analyse ce CV et extrais les informations suivantes en JSON :
{
  "nom": "prénom et nom",
  "postes": [{"titre": "", "entreprise": "", "periode": "", "type": "CDI/CDD/interim"}],
  "formation": [{"diplome": "", "etablissement": "", "annee": ""}],
  "competences": [],
  "langues": [],
  "trous": ["période X à Y sans activité documentée"],
  "transitions": ["changement de secteur ou de métier notable"],
  "postes_courts": ["poste de moins d'1 an"],
  "resume_recruteur": "En 3 phrases, ce que remarquerait immédiatement un recruteur sur ce profil"
}
Réponds UNIQUEMENT avec le JSON valide, sans markdown.`
            }
          ]
        }]
      });

      responseText = response.content[0]?.text || '{}';

    } else {
      // ── SINGLE PROMPT MODE ──
      if (!prompt) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };
      }

      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      responseText = response.content[0]?.text || '';
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ text: responseText }),
    };

  } catch (error) {
    console.error('Chat function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
