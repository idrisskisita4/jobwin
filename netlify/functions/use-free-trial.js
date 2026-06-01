const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Gating de l'essai gratuit : 1 email = 1 essai.
// Table Supabase attendue : free_trials (email TEXT UNIQUE, used_at TIMESTAMPTZ, score INT)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const { email } = JSON.parse(event.body || '{}');

    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ allowed: false, error: 'Email manquant' }) };
    }

    // Normalisation : minuscules + sans espaces, pour éviter les doublons "Jean@x" / "jean@x "
    const cleanEmail = email.trim().toLowerCase();

    // Validation basique du format email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { statusCode: 400, headers, body: JSON.stringify({ allowed: false, error: 'Email invalide' }) };
    }

    // Cet email a-t-il déjà utilisé son essai ?
    const { data: existing, error: selectError } = await supabase
      .from('free_trials')
      .select('email')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (selectError) {
      // En cas d'erreur Supabase, on AUTORISE (ne pas bloquer un vrai utilisateur
      // à cause d'un souci technique — on préfère laisser passer que frustrer).
      return { statusCode: 200, headers, body: JSON.stringify({ allowed: true, degraded: true }) };
    }

    if (existing) {
      // Email déjà utilisé → essai déjà consommé → on bloque.
      return { statusCode: 200, headers, body: JSON.stringify({ allowed: false, alreadyUsed: true }) };
    }

    // Premier essai pour cet email → on l'enregistre et on autorise.
    const { error: insertError } = await supabase
      .from('free_trials')
      .insert({ email: cleanEmail });

    if (insertError) {
      // Si l'insertion échoue à cause d'une contrainte unique (course entre deux
      // requêtes quasi simultanées), c'est que l'email vient d'être enregistré → on bloque.
      if (insertError.code === '23505') {
        return { statusCode: 200, headers, body: JSON.stringify({ allowed: false, alreadyUsed: true }) };
      }
      // Autre erreur → on autorise plutôt que de frustrer un vrai utilisateur.
      return { statusCode: 200, headers, body: JSON.stringify({ allowed: true, degraded: true }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ allowed: true }) };

  } catch (err) {
    console.error('use-free-trial error:', err);
    // Erreur inattendue → on autorise (ne pas bloquer un vrai utilisateur).
    return { statusCode: 200, headers, body: JSON.stringify({ allowed: true, degraded: true }) };
  }
};
