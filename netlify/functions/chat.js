const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, maxTokens = 600, systemPrompt, messages, conversational } = body;

    let responseText;

    if (conversational && messages && Array.isArray(messages)) {
      // ── MULTI-TURN MODE ──
      // Filter out meta-instruction messages (last message from user asking for reaction)
      const conversationMessages = messages.filter((m, i) => {
        // Remove the last [instruction] message we added
        if (i === messages.length - 1 && m.role === 'user' && m.content.startsWith('[')) return false;
        return m.content && m.content.trim().length > 0;
      });

      const sys = systemPrompt || 'Tu es un recruteur professionnel en entretien d\'embauche. Réponds naturellement en français.';

      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens || 200,
        system: sys,
        messages: conversationMessages,
      });

      responseText = response.content[0]?.text || '';

      // If it was a reaction request, add a final instruction turn
      if (messages[messages.length - 1]?.content?.startsWith('[')) {
        const reactionResponse = await client.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: maxTokens || 150,
          system: sys + '\nRègle absolue : réagis à la dernière réponse du candidat en 1-2 phrases maximum. Ne pose PAS de question. Réagis à quelque chose de précis dans sa réponse.',
          messages: [
            ...conversationMessages,
            { role: 'user', content: messages[messages.length - 1].content }
          ],
        });
        responseText = reactionResponse.content[0]?.text || responseText;
      }

    } else {
      // ── SINGLE PROMPT MODE (legacy) ──
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
