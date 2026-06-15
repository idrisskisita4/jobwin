// netlify/functions/send-trial-email.js
// Envoie l'email post-entretien gratuit : score + CTA packs
// Appelé depuis app.html quand l'analyse de l'essai gratuit est terminée.
// Variables d'env requises : BREVO_API_KEY

const ALLOWED_ORIGINS = [
  'https://jobwin.fr',
  'https://www.jobwin.fr',
  'https://spontaneous-fudge-9adda1.netlify.app'
];

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const cors = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.BREVO_API_KEY) {
    console.error('[send-trial-email] BREVO_API_KEY manquante');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Config error' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, prenom, score, points_forts, axes_progression } = payload;

  // Validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Email invalide' }) };
  }
  if (score === undefined || score === null || score === '') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Score manquant' }) };
  }

  const safe = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 300);
  const scoreSafe = safe(score);
  const prenomSafe = safe(prenom);
  const fortsList = Array.isArray(points_forts) ? points_forts.slice(0, 3).map(safe) : [];
  const axesList = Array.isArray(axes_progression) ? axes_progression.slice(0, 3).map(safe) : [];

  const liItems = (arr) =>
    arr.map((t) => `<li style="margin:0 0 8px 0;line-height:1.5;">${t}</li>`).join('');

  const fortsBlock = fortsList.length
    ? `<p style="margin:24px 0 8px 0;font-weight:700;color:#1B2E4A;">✅ Tes points forts</p>
       <ul style="margin:0;padding-left:20px;color:#374151;">${liItems(fortsList)}</ul>`
    : '';

  const axesBlock = axesList.length
    ? `<p style="margin:24px 0 8px 0;font-weight:700;color:#1B2E4A;">🎯 Tes axes de progression</p>
       <ul style="margin:0;padding-left:20px;color:#374151;">${liItems(axesList)}</ul>`
    : '';

  const bonjour = prenomSafe ? `Bonjour ${prenomSafe},` : 'Bonjour,';

  const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">

    <!-- En-tête -->
    <div style="background:#1B2E4A;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">JOBWIN <span style="color:#2563EB;">✓</span></span>
    </div>

    <!-- Corps -->
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px 28px;">
      <p style="margin:0 0 16px 0;color:#374151;font-size:15px;">${bonjour}</p>
      <p style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.6;">
        Ton entretien d'entraînement est terminé. Voici ton résultat :
      </p>

      <!-- Score -->
      <div style="background:#EFF6FF;border:2px solid #2563EB;border-radius:12px;padding:24px;text-align:center;margin:0 0 8px 0;">
        <p style="margin:0 0 4px 0;color:#1B2E4A;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Ton score</p>
        <p style="margin:0;color:#2563EB;font-size:42px;font-weight:800;">${scoreSafe}</p>
      </div>

      ${fortsBlock}
      ${axesBlock}

      <p style="margin:28px 0 8px 0;color:#374151;font-size:15px;line-height:1.6;">
        Un seul entretien ne suffit pas à transformer ta préparation. Les candidats qui décrochent le poste s'entraînent <strong>plusieurs fois</strong>, sur des questions différentes, jusqu'à être à l'aise.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0 8px 0;">
        <a href="https://jobwin.fr/#packs"
           style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:10px;">
          Continuer ma préparation →
        </a>
        <p style="margin:12px 0 0 0;color:#6B7280;font-size:13px;">Packs à partir de 9,90&nbsp;€ — paiement unique, sans abonnement</p>
      </div>

      <!-- Demande d'avis Trustpilot -->
      <div style="border-top:1px solid #E5E7EB;margin-top:28px;padding-top:20px;text-align:center;">
        <p style="margin:0 0 6px 0;color:#374151;font-size:14px;">Ton avis nous aide à progresser ⭐</p>
        <a href="https://fr.trustpilot.com/evaluate/jobwin.fr"
           style="color:#2563EB;text-decoration:none;font-weight:600;font-size:14px;">
          Laisse un avis sur JOBWIN
        </a>
      </div>
    </div>

    <!-- Pied de page -->
    <p style="text-align:center;color:#9CA3AF;font-size:12px;margin:20px 0 0 0;">
      JOBWIN — Ton simulateur d'entretien d'embauche<br>
      <a href="https://jobwin.fr" style="color:#9CA3AF;">jobwin.fr</a>
    </p>
  </div>
</body>
</html>`;

  // Envoi Brevo — avec logging complet (leçon des échecs silencieux du webhook)
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'JOBWIN', email: 'contact@jobwin.fr' },
        to: [{ email }],
        subject: `Ton score d'entretien JOBWIN : ${scoreSafe}`,
        htmlContent
      })
    });

    const brevoBody = await res.text();
    console.log('[send-trial-email] Brevo status:', res.status, '| body:', brevoBody);

    if (!res.ok) {
      console.error('[send-trial-email] Échec Brevo pour', email);
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Email send failed' }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[send-trial-email] Exception:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server error' }) };
  }
};
