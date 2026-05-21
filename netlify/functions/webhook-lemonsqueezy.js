const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Pack config — maps Lemon Squeezy variant ID to pack info
const PACKS = {
  '0ed1af22-65f0-432d-af22-5d84376b9247': { name: 'DECOUVERTE', credits: 3 },
  '34461eff-9f25-45d7-bb57-f4821e343472': { name: 'ESSENTIEL', credits: 8 },
  // Add INTENSIF variant ID here when you have it
};

function generateCode(packName) {
  const prefix = packName.substring(0, 3).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const suffix = Date.now().toString(36).substring(-4).toUpperCase();
  return `${prefix}-${random}-${suffix}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Verify webhook signature from Lemon Squeezy
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (secret) {
      const signature = event.headers['x-signature'];
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(event.body);
      const digest = hmac.digest('hex');
      if (signature !== digest) {
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const payload = JSON.parse(event.body);
    const eventName = payload.meta?.event_name;

    // Only process successful orders
    if (eventName !== 'order_created') {
      return { statusCode: 200, body: 'Event ignored' };
    }

    const order = payload.data?.attributes;
    const variantId = payload.data?.relationships?.order_items?.data?.[0]?.id;
    const customerEmail = order?.user_email || order?.email;
    const status = order?.status;

    if (status !== 'paid') {
      return { statusCode: 200, body: 'Order not paid yet' };
    }

    // Find pack from variant
    let pack = null;
    // Try to match from order items
    const items = order?.order_items || [];
    for (const item of items) {
      const vid = String(item.variant_id);
      if (PACKS[vid]) {
        pack = PACKS[vid];
        break;
      }
    }

    // Fallback — detect from order total
    if (!pack) {
      const total = order?.total || 0;
      if (total <= 1000) pack = { name: 'DECOUVERTE', credits: 3 };
      else if (total <= 2000) pack = { name: 'ESSENTIEL', credits: 8 };
      else pack = { name: 'INTENSIF', credits: 20 };
    }

    // Generate unique code
    const code = generateCode(pack.name);

    // Save to Supabase
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
      console.error('Insert error:', insertError);
      return { statusCode: 500, body: 'Database error' };
    }

    // Send email via Brevo (if configured)
    const brevoKey = process.env.BREVO_API_KEY;
    if (brevoKey && customerEmail) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
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
              <h1 style="color:#3B82F6;font-size:28px;margin-bottom:8px">Jobwin</h1>
              <p style="color:rgba(255,255,255,.6);margin-bottom:32px">Votre simulateur d'entretien IA</p>
              
              <h2 style="font-size:20px;margin-bottom:16px">Votre accès est prêt !</h2>
              <p style="color:rgba(255,255,255,.7);margin-bottom:24px">Merci pour votre achat du <strong>Pack ${pack.name}</strong>. Voici votre code d'accès personnel :</p>
              
              <div style="background:#1B2E4A;border:2px solid #2563EB;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px">
                <div style="font-size:12px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Votre code d'accès</div>
                <div style="font-size:32px;font-weight:bold;color:white;letter-spacing:4px">${code}</div>
                <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:8px">${pack.credits} entretiens disponibles</div>
              </div>
              
              <p style="color:rgba(255,255,255,.6);margin-bottom:16px">Pour utiliser votre code :</p>
              <ol style="color:rgba(255,255,255,.6);padding-left:20px;line-height:1.8">
                <li>Rendez-vous sur <a href="https://jobwin.fr/app" style="color:#3B82F6">jobwin.fr/app</a></li>
                <li>Entrez votre code d'accès</li>
                <li>Commencez votre simulation d'entretien</li>
              </ol>
              
              <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;color:rgba(255,255,255,.3)">
                Ce code est personnel — ne le partagez pas. Il vous donne accès à ${pack.credits} entretiens.
              </div>
            </div>
          `,
        }),
      });
    }

    console.log(`Code ${code} created for ${customerEmail} - Pack ${pack.name}`);
    return { statusCode: 200, body: JSON.stringify({ success: true, code }) };

  } catch (err) {
    console.error('Webhook error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
