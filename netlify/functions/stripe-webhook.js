const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Code dérivé de l'identifiant de la session Stripe : si Stripe renvoie
// le même paiement (relance automatique), on retrouve le même code
// au lieu d'en créer un second.
function generateCode(packName, sessionId) {
  const prefix = packName.substring(0, 3).toUpperCase();
  const h = crypto.createHash('sha256').update(String(sessionId)).digest('hex').toUpperCase();
  return `${prefix}-${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

// Alerte envoyée à JOBWIN quand un client risque de ne pas recevoir son code
async function alertOwner(subject, lines) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return;
  try {
    const safe = (t) => String(t).replace(/</g, '&lt;');
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'JOBWIN Alerte', email: 'contact@jobwin.fr' },
        to: [{ email: 'contact@jobwin.fr' }],
        subject: `⚠️ JOBWIN — ${subject}`,
        htmlContent: `<div style="font-family:Arial,sans-serif">${lines.map((l) => `<p>${safe(l)}</p>`).join('')}</div>`,
      }),
