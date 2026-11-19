// netlify/functions/relances-envoi.js
// Lancée automatiquement chaque heure par Netlify (voir netlify.toml). Envoie les 3 emails de conseils
// aux personnes qui ont coché la case après leur Pré-entretien : J+1, J+3, J+6, entre 9 h et 21 h (heure de Paris).
// Jamais aux personnes désinscrites, ni à celles qui ont acheté un pack.
// Variables d'env : SUPABASE_URL, SUPABASE_SERVICE_KEY, BREVO_API_KEY

const DAY = 24 * 60 * 60 * 1000;
const NEXT_GAP = { 1: 2 * DAY, 2: 3 * DAY }; // email 1 à J+1 → email 2 deux jours après (J+3) → email 3 trois jours après (J+6)
const MAX_FAILS = 5;                          // au-delà, on arrête la série pour cette adresse
const KEEP_DAYS = 120;                        // lignes terminées effacées 4 mois après l'accord
const SITE = 'https://jobwin.fr';
const UNSUB = SITE + '/.netlify/functions/relances-desinscription?t=';
const LEGAL = 'Jobwin, entrepreneur individuel Idriss Kisita, 142 rue de Rivoli, 75001 Paris.';

const enc = encodeURIComponent;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nb = (s) => s.replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0'); // pas de « ! » seul en début de ligne
const likeExact = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m); // ilike sans joker = égalité sans tenir compte des majuscules
const cta = (n) => `${SITE}/?utm_source=email&utm_medium=relance&utm_campaign=j${[1, 3, 6][n - 1]}#pricing`;

function parisHour(d) {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find((x) => x.type === 'hour');
    const h = parseInt(part && part.value, 10);
    if (h >= 0 && h <= 23) return h;
  } catch (e) {}
  return (d.getUTCHours() + 1) % 24; // repli : heure d'hiver de Paris
}

function sb(path, opts = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
}
const patch = (email, fields) => sb(`email_relances?email=eq.${enc(email)}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fields)
});

// ---------- Les 3 emails (textes validés dans le doc « Kit visibilité Google & IA + emails de relance ») ----------
const EMAILS = {
  1: {
    subject: 'Ta première réponse était prête. Et la suivante ?',
    preheader: 'Ce qui se joue après « Concrètement ? »',
    paras: [
      'Bonjour,',
      'Tu as passé ton Pré-entretien sur Jobwin il y a peu. Merci d’avoir joué le jeu, à voix haute.',
      'En entretien, la première réponse se prépare. C’est la question d’après qui fait la différence : « Concrètement, vous avez fait quoi, vous ? », « Un exemple précis ? », « Combien ? Sur quelle période ? »',
      'Le réflexe qui aide : pour chaque expérience de ton CV, garde en tête un exemple avec un résultat (un chiffre, un délai, un avant/après). Quand la relance tombe, tu n’improvises plus : tu racontes.',
      'Dans l’entretien complet, le recruteur part de ton CV et de l’annonce du poste, et te relance comme ça sur une dizaine de questions.'
    ],
    button: 'Faire un entretien complet →',
    after: ['Pack Découverte : 9,90 € les 3 entretiens complets, en paiement unique.']
  },
  2: {
    subject: '« Et ces 8 mois, vous faisiez quoi ? »',
    preheader: 'Les questions sur ton parcours, celles qu’on préfère ne pas préparer.',
    paras: [
      'Bonjour,',
      'Un recruteur lit ton CV en cherchant ce qui accroche : un trou de quelques mois, un poste resté court, un changement de voie. C’est souvent là qu’il pose ses questions.',
      'Le piège, c’est de se justifier trop longtemps. Plus tu t’expliques, plus ça sonne comme une excuse.',
      'Ce qui marche mieux tient en deux phrases : ce qui s’est passé, puis ce que tu en as tiré. Ensuite, tu reviens au poste.',
      'Sur Jobwin, le recruteur lit ton CV et va chercher exactement ces endroits-là, avant que le vrai ne le fasse.'
    ],
    button: 'Préparer ces questions-là →',
    after: ['Pack Essentiel : 19,90 € les 8 entretiens complets, valables 12 mois.']
  },
  3: {
    subject: 'Ton entretien, c’est pour quand ?',
    preheader: 'Le dernier email de la série, avec le récap des packs.',
    paras: [
      'Bonjour,',
      'Si un entretien arrive, voici comment t’en servir : un entretien complet 2 ou 3 jours avant, avec ton CV et l’annonce. Puis un dernier la veille, sur ce qui t’a mis en difficulté.',
      'Ce que contient un pack :'
    ],
    list: [
      'l’entretien complet, avec ton CV et l’annonce du poste',
      'le choix du type d’entreprise (grand groupe, PME, startup, administration), du contrat et de ton niveau',
      '6 recruteurs aux styles différents',
      'à la fin, ton score de préparation et les 3 choses qui pourraient te pénaliser, avec quoi faire à la place'
    ],
    paras2: ['Découverte 9,90 € (3 entretiens), Essentiel 19,90 € (8), Intensif 34,90 € (20). Paiement unique, sans abonnement, valable 12 mois.'],
    button: 'Choisir mon pack →',
    after: ['C’était le dernier email de cette série. Bon entretien !']
  }
};

function buildEmail(n, token) {
  const e = EMAILS[n], link = cta(n), unsub = UNSUB + enc(token);
  const p = (t) => `<p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.6;">${esc(nb(t))}</p>`;
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(e.preheader)}</span>
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1B2E4A;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px;">JOBWIN <span style="color:#2563EB;">✓</span></span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px 28px;">
      ${e.paras.map(p).join('\n      ')}
      ${e.list ? `<ul style="margin:0 0 16px 0;padding-left:20px;color:#374151;font-size:15px;line-height:1.6;">${e.list.map((t) => `<li style="margin:0 0 6px 0;">${esc(nb(t))}</li>`).join('')}</ul>` : ''}
      ${(e.paras2 || []).map(p).join('\n      ')}
      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${esc(link)}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:10px;">${esc(e.button)}</a>
      </div>
      ${e.after.map((t) => `<p style="margin:8px 0 0 0;color:#6B7280;font-size:13px;line-height:1.5;text-align:center;">${esc(nb(t))}</p>`).join('')}
    </div>
    <p style="text-align:center;color:#9CA3AF;font-size:12px;line-height:1.6;margin:20px 0 0 0;">
      Tu reçois cet email car tu as accepté de recevoir 3 conseils après ton Pré-entretien Jobwin.<br>
      <a href="${esc(unsub)}" style="color:#6B7280;">Se désinscrire</a> · ${esc(LEGAL)}
    </p>
  </div>
</body>
</html>`;
  const text = [
    ...e.paras, ...(e.list || []).map((t) => '- ' + t), ...(e.paras2 || []),
    `${e.button.replace(' →', '')} : ${link}`, ...e.after, '',
    'Tu reçois cet email car tu as accepté de recevoir 3 conseils après ton Pré-entretien Jobwin.',
    `Se désinscrire : ${unsub}`, LEGAL
  ].join('\n\n');
  return { subject: e.subject, html, text };
}

exports.handler = async () => {
  const now = new Date();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.BREVO_API_KEY) {
    console.error('[relances] variable d’environnement manquante (SUPABASE_URL, SUPABASE_SERVICE_KEY ou BREVO_API_KEY)');
    return { statusCode: 200, body: 'config' };
  }
  const h = parisHour(now);
  if (h < 9 || h >= 21) return { statusCode: 200, body: 'hors créneau (9 h - 21 h)' };

  const due = await sb(`email_relances?select=email,token,step,fails&unsubscribed_at=is.null&purchased_at=is.null&step=lt.3&next_at=lte.${enc(now.toISOString())}&order=next_at.asc&limit=40`);
  if (!due.ok) {
    console.error('[relances] lecture impossible', due.status, (await due.text()).slice(0, 200));
    return { statusCode: 200, body: 'lecture impossible' };
  }
  const rows = await due.json();
  let sent = 0, buyers = 0, failed = 0;

  for (const row of rows) {
    // A acheté un pack depuis ? (un paiement Stripe crée une ligne dans access_codes) → on arrête la série.
    const bought = await sb(`access_codes?select=email&email=ilike.${enc(likeExact(row.email))}&limit=1`);
    if (!bought.ok) { console.error('[relances] vérification d’achat impossible', bought.status); failed++; continue; } // dans le doute, on n'envoie pas
    if ((await bought.json()).length) { await patch(row.email, { purchased_at: now.toISOString() }); buyers++; continue; }

    const n = (row.step || 0) + 1;
    const mail = buildEmail(n, row.token);
    let res;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'JOBWIN', email: 'contact@jobwin.fr' },
          to: [{ email: row.email }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
          tags: [`relance-j${[1, 3, 6][n - 1]}`]
        })
      });
    } catch (e) {
      res = { ok: false, status: 0, text: async () => e.message };
    }
    if (res.ok) {
      await patch(row.email, {
        step: n,
        fails: 0,
        last_sent_at: now.toISOString(),
        ...(NEXT_GAP[n] ? { next_at: new Date(now.getTime() + NEXT_GAP[n]).toISOString() } : {})
      });
      sent++;
    } else {
      const fails = (row.fails || 0) + 1;
      console.error(`[relances] email ${n} refusé par Brevo (${res.status}) :`, String(await res.text()).slice(0, 200));
      await patch(row.email, fails >= MAX_FAILS ? { fails, step: 3 } : { fails }); // réessai l'heure suivante, abandon après 5 échecs
      failed++;
    }
  }

  // Ménage : 4 mois après l'accord, on efface les séries terminées, désinscrites ou arrêtées par un achat.
  const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY).toISOString();
  const del = await sb(`email_relances?consent_at=lt.${enc(cutoff)}&or=(step.gte.3,unsubscribed_at.not.is.null,purchased_at.not.is.null)`, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' }
  });
  if (!del.ok) console.error('[relances] ménage impossible', del.status);

  console.log(`[relances] ${rows.length} à traiter : ${sent} envoyé(s), ${buyers} acheteur(s) écarté(s), ${failed} échec(s)`);
  return { statusCode: 200, body: JSON.stringify({ due: rows.length, sent, buyers, failed }) };
};

exports.buildEmail = buildEmail; // pour les tests
