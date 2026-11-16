// netlify/functions/retractation.js
// Fonction de rétractation en ligne (« Renoncer au contrat ici », obligatoire depuis le 19 juin 2026).
// Reçoit la demande du client, prévient Jobwin et envoie au client un accusé de réception horodaté.
// Variables d'env : BREVO_API_KEY (obligatoire), SUPABASE_URL + SUPABASE_SERVICE_KEY (anti-abus, facultatif)

const ALLOWED_ORIGINS = [
  'https://jobwin.fr',
  'https://www.jobwin.fr',
  'https://spontaneous-fudge-9adda1.netlify.app'
];
const OWNER = 'contact@jobwin.fr';
const PACKS = ['', 'Découverte', 'Essentiel', 'Intensif'];

// Anti-abus : TRUE si la requête doit être bloquée. Fail-open (même logique que chat.js).
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
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: `${name}:${windowSec}:${ip}`, p_limit: limit, p_window_seconds: windowSec })
    });
    if (!r.ok) return false;
    return (await r.json()) === false;
  } catch (e) {
    return false;
  }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendMail(to, subject, html, replyTo) {
  const body = { sender: { name: 'JOBWIN', email: OWNER }, to: [{ email: to }], subject, htmlContent: html };
  if (replyTo) body.replyTo = { email: replyTo };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Brevo ${r.status} ${t.slice(0, 200)}`);
  }
}

// « le 16/11/2026 à 14:05 », heure de Paris
function horodatage(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `le ${p.day}/${p.month}/${p.year} à ${p.hour}:${p.minute}`;
}

exports.handler = async (event) => {
  const origin = event.headers.origin || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  const reply = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  if (!process.env.BREVO_API_KEY) {
    console.error('[retractation] BREVO_API_KEY manquante');
    return reply(500, { error: 'Service indisponible' });
  }

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Requête invalide' }); }

  // Champ piège invisible : un robot le remplit, un humain non. On répond « ok » sans rien envoyer.
  if (p.website) return reply(200, { ok: true, recu: horodatage(new Date()) });

  const nom = String(p.nom || '').trim().replace(/\s+/g, ' ');
  const email = String(p.email || '').trim().toLowerCase();
  const reference = String(p.reference || '').trim().toUpperCase();
  const pack = String(p.pack || '').trim();
  const dateAchat = String(p.date_achat || '').trim();

  if (nom.length < 2 || nom.length > 100) return reply(400, { error: 'Nom invalide' });
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Email invalide' });
  if (reference && !/^[A-Z0-9-]{3,40}$/.test(reference)) return reply(400, { error: 'Clé d\'accès invalide' });
  if (!PACKS.includes(pack)) return reply(400, { error: 'Pack invalide' });
  if (dateAchat && !/^\d{4}-\d{2}-\d{2}$/.test(dateAchat)) return reply(400, { error: 'Date invalide' });

  if (await shouldBlock(event, 'retractation', 5, 3600)) {
    return reply(429, { error: 'Trop de demandes. Écrivez-nous à contact@jobwin.fr.' });
  }

  const now = new Date();
  const recu = horodatage(now);
  const dateFr = dateAchat ? dateAchat.split('-').reverse().join('/') : 'non indiquée';
  const lignes = [
    ['Nom', nom], ['Email', email], ['Clé d\'accès', reference || 'non indiquée'],
    ['Pack', pack || 'non indiqué'], ['Date d\'achat', dateFr], ['Demande reçue', `${recu} (heure de Paris)`]
  ];
  const tableau = `<table style="border-collapse:collapse;font-size:14px">${lignes.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b">${esc(k)}</td><td style="padding:6px 0;color:#0f172a"><strong>${esc(v)}</strong></td></tr>`).join('')}</table>`;
  const wrap = (inner) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6">${inner}</div>`;

  try {
    // 1) Jobwin est prévenu (réponse directe possible au client)
    await sendMail(OWNER, `Rétractation — ${nom}${pack ? ' — pack ' + pack : ''}`, wrap(`
      <h2 style="font-size:18px">Nouvelle demande de rétractation</h2>
      ${tableau}
      <p><strong>À faire sous 14 jours :</strong> rembourser les entretiens non utilisés depuis Stripe, puis désactiver la clé dans Supabase (table access_codes, colonne active).</p>`), email);

    // 2) Accusé de réception horodaté au client (support durable)
    await sendMail(email, 'Jobwin — accusé de réception de votre rétractation', wrap(`
      <h2 style="font-size:18px;color:#1B2E4A">Votre demande de rétractation est bien reçue</h2>
      <p>Bonjour ${esc(nom)},</p>
      <p>Nous avons bien reçu votre demande de rétractation <strong>${esc(recu)}</strong> (heure de Paris).</p>
      ${tableau}
      <p>Nous vous remboursons les entretiens que vous n'avez pas utilisés dans les 14 jours, par le même moyen de paiement que votre achat. Votre clé d'accès sera ensuite désactivée.</p>
      <p>Une question ? Répondez simplement à cet email ou écrivez à ${OWNER}.</p>
      <p style="margin-top:28px;font-size:12px;color:#64748b">Jobwin — Idriss Kisita, entrepreneur individuel — SIRET 106 681 976 00010 — ${OWNER}<br>Conditions générales de vente : https://jobwin.fr/cgv.html</p>`));
  } catch (e) {
    console.error('[retractation] envoi impossible:', e.message);
    return reply(502, { error: 'Envoi impossible. Écrivez-nous à contact@jobwin.fr.' });
  }

  return reply(200, { ok: true, recu });
};
