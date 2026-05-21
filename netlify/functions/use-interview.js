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

    if (!code) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Code manquant' }) };
    }

    const cleanCode = code.trim().toUpperCase();

    // Get current state
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .eq('code', cleanCode)
      .single();

    if (error || !data) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Code invalide' }) };
    }

    if (!data.active) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Code désactivé' }) };
    }

    const remaining = data.credits - data.used;

    if (remaining <= 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, error: 'Plus d\'entretiens disponibles' }) };
    }

    // Increment used count
    const newUsed = data.used + 1;
    const newActive = newUsed < data.credits; // deactivate if all used

    const { error: updateError } = await supabase
      .from('access_codes')
      .update({ used: newUsed, active: newActive })
      .eq('code', cleanCode);

    if (updateError) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Erreur mise à jour' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        remaining: remaining - 1,
        used: newUsed,
        credits: data.credits,
      }),
    };

  } catch (err) {
    console.error('use-interview error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Erreur serveur' }) };
  }
};
