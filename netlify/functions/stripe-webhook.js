const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function generateCode(packName) {
  const prefix = packName.substring(0, 3).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${random}-${suffix}`;
}

// Vérification de signature Stripe (sans dépendance npm)
function verifyStripeSignature(rawBody, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const timestamp = parts.t;
  const signatures = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  // Refuse les événements de plus de 5 minutes (anti-rejeu)
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (age > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  return signatures.some((sig) => {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('STRIPE_WEBHOOK_SECRET manquant');
      return { statusCode: 500, body: 'Webhook not configured' };
    }

    // Corps brut exact, indispensable pour la signature
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
      console.error('Signature Stripe invalide');
      return { statusCode: 400, body: 'Invalid signature' };
    }

    const payload = JSON.parse(rawBody);

    if (payload.type !== 'checkout.session.completed') {
      return { statusCode: 200, body: 'Event ignored' };
    }

    const session = payload.data?.object;
    const customerEmail = session?.customer_details?.email || session?.customer_email;
    const paymentStatus = session?.payment_status;

    console.log('Payment status:', paymentStatus, 'Email:', customerEmail);

    if (paymentStatus !== 'paid') {
      return { statusCode: 200, body: `Payment status ${paymentStatus} ignored` };
    }

    // Détection du pack par montant (en centimes)
    // Découverte 9,90 / Essentiel 14,90 (promo incluse) / Intensif 34,90
    const total = session?.amount_total || 0;
    let pack;
    if (total <= 1100) pack = { name: 'DECOUVERTE', credits: 3 };
    else if (total <= 2500) pack = { name: 'ESSENTIEL', credits: 8 };
    else pack = { name: 'INTENSIF', credits: 20 };

    console.log('Total cents:', total, 'Pack:', pack.name);

    const code = generateCode(pack.name);

    const { error: insertError } = await supabase
      .from('access_codes')
      .insert({
        code,
        pack: pack.name,
        credits: pack.credits,
        used: 0,
        active: true,
        email: customerEmail,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Supabase insert error:', JSON.stringify(insertError));
      return { statusCode: 500, body: 'Database error' };
    }

    console.log('Code saved:', code);

    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey && customerEmail) {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'JOBWIN', email: 'contact@jobwin.fr' },
          to: [{ email: customerEmail }],
          subject: `Votre code d'accès JOBWIN — Pack ${pack.name}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0F1E35;color:white;padding:40px;border-radius:16px">
              <h1 style="color:#3B82F6;font-size:28px;margin-bottom:8px">JOBWIN</h1>
              <p style="color:rgba(255,255,255,.6);margin-bottom:32px">Votre simulateur d'entretien IA</p>
              <h2 style="font-size:20px;margin-bottom:16px">Votre accès est prêt !</h2>
              <p style="color:rgba(255,255,255,.7);margin-bottom:24px">Merci pour votre achat du <strong>Pack ${pack.name}</strong>. Voici votre code d'accès personnel :</p>
              <div style="background:#1B2E4A;border:2px solid #2563EB;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px">
                <div style="font-size:12px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Votre code d'accès</div>
                <div style="font-size:32px;font-weight:bold;color:white;letter-spacing:4px">${code}</div>
                <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:8px">${pack.credits} entretiens disponibles</div>
              </div>
              <ol style="color:rgba(255,255,255,.6);padding-left:20px;line-height:1.8">
                <li>Rendez-vous sur <a href="https://jobwin.fr/app" style="color:#3B82F6">jobwin.fr/app</a></li>
                <li>Entrez votre code d'accès</li>
                <li>Commencez votre simulation d'entretien</li>
              </ol>
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;color:rgba(255,255,255,.3)">
                Code personnel — ne le partagez pas. Valable pour ${pack.credits} entretiens.
              </div>
            </div>
          `,
        }),
      });

      const brevoBody = await brevoRes.text();
      console.log('Brevo status:', brevoRes.status, brevoBody);

      if (!brevoRes.ok) {
        // Code enregistré mais mail échoué : on répond 200 pour éviter
        // que Stripe renvoie l'événement et crée un 2e code
        console.error('Brevo email failed — envoyer le code à la main:', code, customerEmail);
      }
    } else {
      console.warn('Brevo non configuré ou email client absent — code:', code);
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Webhook error:', err.message, err.stack);
    return { statusCode: 500, body: 'Server error' };
  }
};
