const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const { code } = JSON.parse(event.body);

    if (!code || code.trim().length < 3) {
      return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Code manquant' }) };
    }

    const cleanCode = code.trim().toUpperCase();

    // Fetch the code from Supabase
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', cleanCode)
      .single();

    if (error || !data) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Code invalide' }) };
    }

    if (!data.active) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Code désactivé' }) };
    }

    const remaining = data.credits - data.used;

    if (remaining <= 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Code épuisé — tous vos entretiens ont été utilisés' }) };
    }

    // Code is valid
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        pack: data.pack,
        credits: data.credits,
        used: data.used,
        remaining,
        email: data.email || null,
      }),
    };

  } catch (err) {
    console.error('validate-code error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Erreur serveur' }) };
  }
};
