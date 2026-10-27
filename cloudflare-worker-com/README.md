# English-site Stripe Checkout Worker

Dedicated Stripe Checkout Worker for `https://danielatorp.com`. It does not change the existing website contact form or the Czech/Norwegian Workers.

## Secrets required in Cloudflare

Set these as Worker secrets (never commit secret values):

- `STRIPE_SECRET_KEY` — the Stripe secret key for the intended English-site merchant/account; use test mode first.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the Stripe webhook.
- `GOOGLE_REGISTRATION_WEBHOOK_URL` — a dedicated registration receiver URL, not the website's existing contact-form endpoint.
- `GOOGLE_REGISTRATION_SHARED_SECRET` — the matching receiver secret.

## Deploy and configure

From this directory:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put GOOGLE_REGISTRATION_WEBHOOK_URL
npx wrangler secret put GOOGLE_REGISTRATION_SHARED_SECRET
npx wrangler deploy
```

In Stripe test mode, add a webhook to `https://danielatorp-com-stripe-checkout.<your-workers-subdomain>.workers.dev/api/webhook` and subscribe to `checkout.session.completed`.

## Checkout

The Worker owns the allowlisted workshop IDs and amounts in NOK øre, using the prices currently displayed on the English website. It records the participant details in Stripe metadata and forwards only verified paid checkout sessions to the dedicated registration receiver. Test successful, cancelled, declined, and webhook retry scenarios before live mode.

The front end calls `POST /api/create-checkout-session` with `workshopId`, `participantName`, and `participantEmail`. The Worker sets the amount server-side; the browser cannot set the price.
