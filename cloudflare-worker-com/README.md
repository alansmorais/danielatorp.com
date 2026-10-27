# English-site Stripe Checkout Worker

Dedicated Stripe Checkout Worker for `https://danielatorp.com`. It does not replace or alter the website's existing contact form, links, descriptions, or the Czech/Norwegian Workers.

## Cloudflare configuration

The Worker is deployed as:

`https://danielatorp-com-stripe-checkout.alanpkmorais.workers.dev`

The non-secret variables are in `wrangler.toml`: `SITE_URL`, `ALLOWED_ORIGIN`, and `GOOGLE_REGISTRATION_WEBHOOK_URL`. The registration URL currently points to the paid-registration receiver already used by the Norwegian Worker.

Set these as Worker secrets in Cloudflare (never commit secret values):

- `STRIPE_SECRET_KEY` — the secret key for the Stripe merchant account that should receive payments from the English site; use test mode first.
- `STRIPE_WEBHOOK_SECRET` — the signing secret for this Worker’s own Stripe webhook endpoint.
- `GOOGLE_REGISTRATION_SHARED_SECRET` — the same shared secret used by the configured registration receiver.

## Stripe webhook

In Stripe test mode, add an endpoint at:

`https://danielatorp-com-stripe-checkout.alanpkmorais.workers.dev/api/webhook`

Subscribe to `checkout.session.completed`, then save the endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`. The signing secret is unique to this webhook endpoint; do not copy the Norwegian webhook signing secret.

## Checkout and prices

The Worker owns the allowlisted workshop IDs and amounts in NOK øre, matching the prices currently displayed on the English website. The browser cannot set the price. The frontend calls `POST /api/create-checkout-session` with `workshopId`, `participantName`, and `participantEmail`.

The Worker deliberately returns a configuration error until all Stripe and registration secrets are present, preventing checkout from taking payment before paid registrations can be recorded. Test successful, cancelled, declined, and webhook retry scenarios in test mode before enabling live payments.
