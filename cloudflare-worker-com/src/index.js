const WORKSHOPS = {
  'play-with-me': { title: 'Play with Me', amount: 690000, description: 'Workshop registration; price in NOK', path: '/workshops/Hraj-si-se-mnou.html' },
  'i-was-pregnant-but': { title: 'I Was Pregnant, But …', amount: 240000, description: 'Workshop registration; price in NOK', path: '/workshops/byla-jsem-tehotna-ale.html' },
  'art-of-pleasing-couples': { title: 'The Art of Pleasing (For Couples)', amount: 540000, description: 'Workshop registration; price in NOK', path: '/workshops/jen-pro-pary.html' },
  'mother-and-daughter': { title: 'Mother and Daughter', amount: 390000, description: 'Workshop registration; price in NOK', path: '/workshops/matka-a-dcera.html' },
  'birth-as-certainty': { title: 'Birth as Certainty', amount: 320000, description: 'Workshop registration; price in NOK', path: '/workshops/porod-jako-jistota.html' },
  'secrets-of-the-pelvic-floor': { title: 'Secrets of the Pelvic Floor', amount: 260000, description: 'Workshop registration; price in NOK', path: '/workshops/tajemstvi-panevniho-dna.html' },
  'art-of-pleasing-a-man': { title: 'The Art of Pleasing a Man', amount: 280000, description: 'Workshop registration; price in NOK', path: '/workshops/umeni-potesit-muze.html' },
  'art-of-pleasing-a-woman': { title: 'The Art of Pleasing a Woman', amount: 280000, description: 'Workshop registration; price in NOK', path: '/workshops/umeni-potesit-zenu.html' },
  'female-essence-and-life-force': { title: 'Female Essence and Life Force', amount: 320000, description: 'Workshop registration; price in NOK', path: '/workshops/zenska-esence-no.html' }
};

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
      'Vary': 'Origin'
    }
  });
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
  const parts = signatureHeader.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    return mismatch === 0;
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://danielatorp.com';
    const originAllowed = origin === allowedOrigin || origin === 'https://www.danielatorp.com' || origin === 'http://localhost:3000';
    const corsOrigin = originAllowed ? origin : allowedOrigin;

    if (request.method === 'OPTIONS') {
      if (!originAllowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
      }});
    }

    if (url.pathname === '/api/webhook') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const rawBody = await request.text();
      const signature = request.headers.get('Stripe-Signature') || '';
      if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
        return new Response('Invalid Stripe signature', { status: 400 });
      }
      let event;
      try { event = JSON.parse(rawBody); } catch { return new Response('Invalid event body', { status: 400 }); }
      const session = event.data?.object || {};
      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
        if (!env.GOOGLE_REGISTRATION_WEBHOOK_URL || !env.GOOGLE_REGISTRATION_SHARED_SECRET) {
          return new Response('Payment verified, but registration destination is not configured', { status: 500 });
        }
        const forward = await fetch(env.GOOGLE_REGISTRATION_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GOOGLE_REGISTRATION_SHARED_SECRET}` },
          body: JSON.stringify({
            type: 'workshop_registration_paid',
            stripe_event_id: event.id,
            checkout_session_id: session.id,
            payment_intent_id: session.payment_intent,
            payment_status: session.payment_status,
            shared_secret: env.GOOGLE_REGISTRATION_SHARED_SECRET,
            amount_total: session.amount_total,
            currency: session.currency,
            customer_email: session.customer_details?.email,
            customer_name: session.customer_details?.name || session.metadata?.participant_name,
            metadata: session.metadata,
            paid_at: new Date().toISOString()
          })
        });
        const result = await forward.json().catch(() => null);
        if (!forward.ok || result?.ok !== true) return new Response('Registration destination failed', { status: 502 });
      }
      return new Response('ok', { status: 200 });
    }

    if (url.pathname !== '/api/create-checkout-session' || request.method !== 'POST') return new Response('Not found', { status: 404 });
    if (!originAllowed) return json({ error: 'Origin is not allowed.' }, 403, allowedOrigin);
    if (!env.STRIPE_SECRET_KEY || !env.SITE_URL) return json({ error: 'Online payments are not configured yet. Please contact Daniela.' }, 503, allowedOrigin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400, allowedOrigin); }
    const workshopId = body.workshopId || '';
    const workshop = WORKSHOPS[workshopId];
    const name = (body.participantName || '').trim().slice(0, 120);
    const email = (body.participantEmail || '').trim().slice(0, 254);
    if (!workshop || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Please check the workshop and your contact details.' }, 400, allowedOrigin);
    }

    const site = new URL(env.SITE_URL);
    const successUrl = new URL(workshop.path, site);
    successUrl.search = '?payment=success&session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = new URL(workshop.path, site);
    cancelUrl.hash = 'kontakt';

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', successUrl.toString());
    form.set('cancel_url', cancelUrl.toString());
    form.set('customer_email', email);
    form.set('client_reference_id', workshopId);
    form.set('line_items[0][price_data][currency]', 'nok');
    form.set('line_items[0][price_data][unit_amount]', String(workshop.amount));
    form.set('line_items[0][price_data][product_data][name]', workshop.title);
    form.set('line_items[0][price_data][product_data][description]', workshop.description);
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[workshop_id]', workshopId);
    form.set('metadata[workshop_title]', workshop.title);
    form.set('metadata[participant_name]', name);
    form.set('metadata[participant_email]', email);
    form.set('metadata[site_language]', 'en');
    form.set('metadata[site_url]', env.SITE_URL);

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok || !stripeData.url) return json({ error: 'Stripe could not prepare the payment. Please try again later.' }, 502, allowedOrigin);
    return json({ url: stripeData.url }, 200, corsOrigin);
  }
};
