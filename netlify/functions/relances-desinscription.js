// netlify/functions/relances-desinscription.js
// Lien « Se désinscrire » des emails de conseils.
// GET : page avec un bouton (les antivirus de messagerie qui ouvrent les liens ne désinscrivent donc personne par erreur).
// POST : désinscription effective. Le jeton est aléatoire et propre à chaque adresse (colonne token).
// Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title, body, form) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · Jobwin</title>
<style>
body{margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#1B2E4A}
.w{max-width:460px;margin:0 auto;padding:40px 16px}
.c{background:#fff;border-radius:14px;padding:28px 22px;box-shadow:0 8px 30px rgba(15,23,42,.08);text-align:center}
.l{font-size:22px;font-weight:800;letter-spacing:1px;margin-bottom:18px}.l b{color:#2563EB}
h1{font-size:20px;margin:0 0 10px}p{font-size:15px;line-height:1.55;color:#4B5563;margin:0 0 16px}
button{width:100%;border:0;border-radius:10px;background:#2563EB;color:#fff;font-size:16px;font-weight:700;padding:14px;cursor:pointer}
a{color:#2563EB}
</style></head><body><div class="w"><div class="c"><div class="l">JOBWIN <b>✓</b></div>
<h1>${title}</h1>${body}${form || ''}</div></div></body></html>`;
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  let t = String(qs.t || '');
  if (!t && event.body) {
    try { t = new URLSearchParams(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body).get('t') || ''; } catch (e) {}
  }
  const valid = UUID.test(t);
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

  if (event.httpMethod === 'GET') {
    if (!valid) return { statusCode: 400, headers, body: page('Lien incomplet', '<p>Ce lien de désinscription est incomplet. Écris-nous à <a href="mailto:contact@jobwin.fr">contact@jobwin.fr</a> et on s’en occupe.</p>') };
    return {
      statusCode: 200, headers,
      body: page('Ne plus recevoir nos conseils', '<p>Tu ne recevras plus les emails de conseils de Jobwin.</p>',
        `<form method="post" action="/.netlify/functions/relances-desinscription?t=${t}"><button type="submit">Me désinscrire</button></form>`)
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: page('Action impossible', '<p>Méthode non autorisée.</p>') };
  if (!valid) return { statusCode: 400, headers, body: page('Lien incomplet', '<p>Écris-nous à <a href="mailto:contact@jobwin.fr">contact@jobwin.fr</a> et on s’en occupe.</p>') };

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  try {
    const res = await fetch(`${url}/rest/v1/email_relances?token=eq.${encodeURIComponent(t)}&unsubscribed_at=is.null`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ unsubscribed_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error('status ' + res.status);
  } catch (e) {
    console.error('[relances-desinscription] échec', e.message);
    return { statusCode: 500, headers, body: page('Un souci technique', '<p>La désinscription n’a pas pu être enregistrée. Écris-nous à <a href="mailto:contact@jobwin.fr">contact@jobwin.fr</a> : on la fait à la main tout de suite.</p>') };
  }
  return { statusCode: 200, headers, body: page('C’est fait', '<p>Tu ne recevras plus les emails de conseils de Jobwin.</p><p><a href="https://jobwin.fr">Retour sur jobwin.fr</a></p>') };
};
