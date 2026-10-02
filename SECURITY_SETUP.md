# Security setup

The CRM's admin API actions now require the signed-in Clerk session, cleaner and
client pages are limited to what their link token allows, and the database can
be locked so the public browser key can't read or write business data.

## 1. Vercel environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Server (API + cron) database access. Falls back to the anon key if unset, which stops working once RLS is locked down. |
| `CRON_SECRET` | **Yes** | Vercel cron auth. The cron now refuses to run if this is missing. |
| `APP_URL` | Recommended | Public URL of the CRM, e.g. `https://crm-nine-delta-37.vercel.app`. Used for every link in emails and Stripe return URLs (the value sent by the browser is ignored). |
| `ADMIN_EMAIL` | Recommended | Where admin notifications go (default `ejretreats1@gmail.com`). |
| `CLERK_PUBLISHABLE_KEY` | Optional | Server verifies admin sessions against this Clerk instance. Defaults to `VITE_CLERK_PUBLISHABLE_KEY`, which Vercel already exposes to functions. `CLERK_JWKS_URL` can override the derived JWKS URL. |
| `VITE_SUPABASE_CLERK_AUTH` | After step 2 | `true` makes the CRM send the Clerk token with every Supabase query. |
| `STRIPE_WEBHOOK_SECRET` | For the webhook | Signing secret of the Stripe webhook endpoint (step 5). |

## 2. Clerk ↔ Supabase (needed before the RLS lockdown)

1. **Clerk dashboard** → *Integrations* → **Supabase** → activate. This adds the
   `"role": "authenticated"` claim to session tokens.
2. **Supabase dashboard** → *Authentication* → *Sign In / Providers* →
   **Third-party auth** → *Add provider* → **Clerk**. Enter your Clerk frontend
   API domain (shown in the Clerk integration screen).
3. In Vercel set `VITE_SUPABASE_CLERK_AUTH=true` and redeploy.
4. Sign in to the CRM and confirm the cleaning tabs still load.

## 3. Lock down the database

Run `supabase-rls-lockdown-migration.sql` in the Supabase SQL Editor. It
replaces the "anyone with the public key" policies on the cleaning tables,
`settings` and `email_logs` with policies for signed-in users only, and adds a
unique index that prevents duplicate jobs for the same reservation.

If something breaks, re-check step 2; the lockdown only affects browser access,
and the server keeps working through the service-role key.

## 4. Rotate old links

Cleaner portal links without a token (the original `?cleaner-dashboard=<id>`
format) no longer work. Re-send portal links from the Cleaners tab.

## What is public, and how it's protected

| Page | Link token | What it can do |
|---|---|---|
| Owner e-sign, agreement fill, template sign | per-document token | sign that document |
| Owner onboarding form | onboarding token | submit the form once |
| Owner portal | owner portal token | read that owner's properties and bookings |
| Cleaning client enrollment / card setup | enrollment / onboarding token | submit details, save a card |
| Cleaner dispatch portal | dispatch token | accept/pass, upload photos, submit the report. Door code only after accepting, while the job is live |
| Cleaner dashboard | dashboard token | see own jobs, accept/pass. Door code only for own live jobs |
| Cleaner agreement / Stripe setup | onboarding / connect token | sign, connect Stripe |

Everything else under `/api/documents` requires a signed-in CRM admin.

## 5. Stripe webhook (receipts, declined-card follow-up, Connect status)

1. Run `supabase-stripe-webhook-migration.sql`.
2. Stripe dashboard → Developers → Webhooks → **Add endpoint**.
   - Endpoint URL: `https://crm-nine-delta-37.vercel.app/api/stripe-webhook` (use your `APP_URL`).
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
     `setup_intent.succeeded`, `account.updated`, `transfer.reversed`,
     `charge.dispute.created`, `charge.refunded`.
   - For `account.updated` to arrive for cleaners' Express accounts, the endpoint
     must **listen to events on Connected accounts** as well (toggle on the
     endpoint form), or add a second endpoint with the same URL for connected accounts.
3. Copy the endpoint's **Signing secret** (`whsec_…`) into Vercel as `STRIPE_WEBHOOK_SECRET`, redeploy.
4. Send a test event from the Stripe dashboard; the endpoint should return `{"received":true,...}`.

What it does: confirms charges and pays cleaners if the API path missed it, emails the
client a receipt with the cleaner's photos, emails a card-update link when a charge is
declined (once per 3 days) and retries the charge automatically once a new card is saved,
marks cleaners Stripe-active and releases waiting payouts when they finish Connect, and
alerts you on reversed transfers, disputes and refunds.
