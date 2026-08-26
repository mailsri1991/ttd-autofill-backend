# TTD Darshan Autofill — License & Payment Backend

This is the piece that lets you sell the autofill feature: 7 days ₹99, 30 days ₹299,
90 days ₹699. Pilgrim details can be entered in the extension for free — this backend
only gates the "Fill this page" action, by checking a license key against Razorpay
payment records.

## What you need to set up (in order)

### 1. Razorpay account (payment provider)

Razorpay is the right choice here over Stripe/PayPal because it's built for Indian
merchants: KYC is straightforward for an individual/proprietorship (PAN + bank account
is often enough to start in test mode, full KYC needed before you can go live), it
supports UPI (most of your customers will pay this way), and its Checkout is a simple
hosted popup — no PCI compliance work on your side.

1. Sign up at https://dashboard.razorpay.com/signup
2. Complete KYC (Settings → Account & Settings) — needed before you can accept **live**
   payments. You can build and test everything below in **Test Mode** first, without KYC.
3. Go to Settings → API Keys → **Generate Test Key** (and later, **Generate Live Key**
   once KYC is approved). Copy the Key ID and Key Secret.
4. Go to Settings → Webhooks → Add New Webhook:
   - URL: `https://YOUR-BACKEND-URL/api/razorpay-webhook` (you'll have this after step 3 below)
   - Secret: make up a strong random string, save it — you'll need it as `RAZORPAY_WEBHOOK_SECRET`
   - Active events: check **payment.captured**
5. Save the Key ID, Key Secret, and Webhook Secret somewhere safe.

### 2. Supabase (database — free tier is enough)

1. Sign up at https://supabase.com and create a new project.
2. Go to the SQL Editor → New query → paste the contents of `schema.sql` from this
   folder → Run. This creates the `orders` and `licenses` tables.
3. Go to Project Settings → API → copy the **Project URL** and the **service_role**
   key (not the "anon" key — the service_role key is what lets this backend read/write
   freely; never put it in the extension or any public frontend).

### 3. Brevo (sends the license key by email — free tier covers this easily)

You already have Brevo connected in your workspace. If setting up a fresh account:
1. Sign up at https://www.brevo.com
2. Go to Settings → SMTP & API → API Keys → Create a new API key.
3. Verify a sender email/domain (Senders, Domains & Dedicated IPs) — Brevo requires
   this before it will send on your behalf.

### 4. Deploy this backend (Render — free tier, minimal setup)

1. Push this folder to a GitHub repo (or use Render's "Deploy from a public Git repo").
2. Go to https://render.com → New → Web Service → connect the repo.
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add all the environment variables from `.env.example` under Render's "Environment"
   tab, filled in with your real values from steps 1–3.
5. Deploy. Render gives you a URL like `https://ttd-autofill-backend.onrender.com` —
   that's your `APP_BASE_URL`. Update the webhook URL in Razorpay (step 1.4) to point
   here for real, and update `APP_BASE_URL` in Render's env vars to match, then redeploy.

Note: Render's free tier spins the server down after ~15 minutes of no traffic and
takes a few seconds to wake back up on the next request — fine for a low-volume side
product, just know the first checkout after a quiet spell may feel briefly slow.

### 5. Point the extension at your backend

In the extension's `popup.js`, set `BACKEND_URL` (near the top of the file) to your
Render URL. Reload the extension.

## How the money actually flows

1. Someone clicks "Buy a plan" in the extension → it opens
   `https://your-backend/checkout.html?plan=30d` in a new tab.
2. They enter their email, click Pay, and complete payment in Razorpay's popup.
3. Razorpay confirms the payment two ways (belt and suspenders): the checkout page's
   own success callback calls `/api/verify-payment`, **and** Razorpay's servers call
   your `/api/razorpay-webhook` independently. Either one is enough to issue the
   license — whichever arrives first does it, the other is a no-op, so you don't get
   double licenses even if both fire.
4. A license key is generated, saved in Supabase with an expiry date, and emailed via
   Brevo. It's also shown right on the success page.
5. The person pastes that key into the extension's popup and clicks Activate. The
   extension calls `/api/verify-license` to confirm it's valid, then remembers that
   locally until the license expires (re-checking periodically so it can't just be
   spoofed indefinitely offline).

## Testing before going live

Use Razorpay's **test mode** keys and their test card (4111 1111 1111 1111, any future
expiry, any CVV) to run through the whole flow — order creation, payment, webhook,
license email, activation — before switching to live keys. Nothing here changes when
you go live except which Razorpay keys are in your environment variables.

## Costs to expect

- Render free tier: ₹0 (with the cold-start caveat above); upgrade to a paid instance
  (~$7/mo) later if it needs to stay always-on.
- Supabase free tier: ₹0 for this volume.
- Brevo free tier: 300 emails/day free — plenty to start.
- Razorpay: no monthly fee, just their per-transaction fee (currently ~2% for
  UPI/cards on standard pricing — confirm current rates in your dashboard, they do
  change).
