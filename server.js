require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const Razorpay = require("razorpay");

const { PLANS } = require("./plans");
const { supabase } = require("./db");
const { sendLicenseEmail } = require("./email");

const app = express();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// The webhook route needs the RAW body to verify its signature, so it's registered
// BEFORE the generic json() body parser below.
app.post("/api/razorpay-webhook", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (signature !== expected) {
      console.warn("Webhook signature mismatch");
      return res.status(400).send("invalid signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload.payment.entity;
      await fulfillOrder(payment.order_id, payment.id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ ok: false });
  }
});

app.use(express.json());

// ---- Create a Razorpay order for a chosen plan ----
app.post("/api/create-order", async (req, res) => {
  try {
    const { email, plan } = req.body;
    if (!email || !PLANS[plan]) {
      return res.status(400).json({ error: "Valid email and plan are required." });
    }

    const order = await razorpay.orders.create({
      amount: PLANS[plan].amountPaise,
      currency: "INR",
      receipt: `ttd_${Date.now()}`,
      notes: { email, plan }
    });

    await supabase.from("orders").insert({
      razorpay_order_id: order.id,
      email,
      plan,
      amount_paise: PLANS[plan].amountPaise,
      status: "created"
    });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      plan,
      plan_label: PLANS[plan].label,
      email
    });
  } catch (err) {
    console.error("create-order error:", err);
    res.status(500).json({ error: "Could not create order." });
  }
});

// ---- Called by the checkout page immediately after Razorpay's payment popup succeeds ----
// (The webhook above is the authoritative path in case the tab closes before this runs;
// fulfillOrder() is idempotent so whichever fires first wins and the other is a no-op.)
app.post("/api/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Payment signature verification failed." });
    }

    const result = await fulfillOrder(razorpay_order_id, razorpay_payment_id);
    res.json(result);
  } catch (err) {
    console.error("verify-payment error:", err);
    res.status(500).json({ error: "Could not verify payment." });
  }
});

// ---- Extension calls this before allowing a fill ----
app.get("/api/verify-license", async (req, res) => {
  try {
    const key = (req.query.key || "").trim().toUpperCase();
    if (!key) return res.status(400).json({ valid: false, reason: "missing_key" });

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", key)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ valid: false, reason: "not_found" });

    const expired = new Date(data.expires_at).getTime() < Date.now();
    if (expired || data.status === "revoked") {
      if (!expired && data.status !== "expired") {
        // status already reflects revoked; nothing to update
      } else if (expired && data.status === "active") {
        await supabase.from("licenses").update({ status: "expired" }).eq("id", data.id);
      }
      return res.json({ valid: false, reason: data.status === "revoked" ? "revoked" : "expired", expires_at: data.expires_at });
    }

    res.json({ valid: true, plan: data.plan, expires_at: data.expires_at, email: data.email });
  } catch (err) {
    console.error("verify-license error:", err);
    res.status(500).json({ valid: false, reason: "server_error" });
  }
});

// ---- Convenience: re-send a license key if someone lost the email ----
app.post("/api/resend-license", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required." });

    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No license found for that email." });

    await sendLicenseEmail({ to: data.email, licenseKey: data.license_key, plan: PLANS[data.plan]?.label || data.plan, expiresAt: data.expires_at });
    res.json({ ok: true });
  } catch (err) {
    console.error("resend-license error:", err);
    res.status(500).json({ error: "Could not resend license." });
  }
});

app.get("/api/plans", (req, res) => {
  res.json(PLANS);
});

app.get("/health", (req, res) => res.json({ ok: true }));

// ---- Shared fulfillment logic: order paid → issue (or reuse) a license, email it ----
async function fulfillOrder(razorpayOrderId, razorpayPaymentId) {
  // Idempotency: if this order already produced a license, don't make another.
  const { data: existing } = await supabase
    .from("licenses")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (existing) {
    return { license_key: existing.license_key, expires_at: existing.expires_at, plan: existing.plan, already_fulfilled: true };
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();

  if (orderErr || !order) throw new Error(`Order ${razorpayOrderId} not found`);

  const plan = PLANS[order.plan];
  if (!plan) throw new Error(`Unknown plan ${order.plan}`);

  const licenseKey = generateLicenseKey();
  const expiresAt = new Date(Date.now() + plan.days * 24 * 60 * 60 * 1000).toISOString();

  const { data: license, error: licenseErr } = await supabase
    .from("licenses")
    .insert({
      license_key: licenseKey,
      email: order.email,
      plan: order.plan,
      amount_paise: order.amount_paise,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      status: "active",
      expires_at: expiresAt
    })
    .select()
    .single();

  if (licenseErr) throw licenseErr;

  await supabase.from("orders").update({ status: "paid" }).eq("razorpay_order_id", razorpayOrderId);

  sendLicenseEmail({ to: order.email, licenseKey, plan: plan.label, expiresAt }).catch(err =>
    console.error("Failed to send license email:", err)
  );

  return { license_key: licenseKey, expires_at: expiresAt, plan: order.plan };
}

function generateLicenseKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if ((i + 1) % 4 === 0 && i !== 15) out += "-";
  }
  return out;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TTD Autofill backend listening on :${PORT}`));
