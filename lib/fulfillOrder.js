import crypto from "node:crypto";
import { PLANS } from "./plans.js";
import { supabase } from "./db.js";
import { sendLicenseEmail } from "./email.js";

// Shared fulfillment logic: order paid → issue (or reuse) a license, email it.
// Called from both /api/verify-payment (the checkout page's own confirmation call) and
// /api/razorpay-webhook (the authoritative path in case the tab closes before that runs).
// Idempotent — whichever fires first wins, the other is a no-op.
export async function fulfillOrder(razorpayOrderId, razorpayPaymentId) {
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

  if (licenseErr) {
    // 23505 = Postgres unique_violation. Means another concurrent call for this same
    // order (webhook retry racing the browser's verify-payment call, or two webhook
    // retries racing each other) already inserted a license between our SELECT check
    // above and this INSERT. That's expected under retries, not a real failure — fetch
    // and return the row that won the race instead of erroring or duplicating.
    if (licenseErr.code === "23505") {
      const { data: winner } = await supabase
        .from("licenses")
        .select("*")
        .eq("razorpay_order_id", razorpayOrderId)
        .maybeSingle();
      if (winner) {
        return { license_key: winner.license_key, expires_at: winner.expires_at, plan: winner.plan, already_fulfilled: true };
      }
    }
    throw licenseErr;
  }

  await supabase.from("orders").update({ status: "paid" }).eq("razorpay_order_id", razorpayOrderId);

  sendLicenseEmail({ to: order.email, licenseKey, plan: plan.label, expiresAt }).catch(err =>
    console.error("Failed to send license email:", err)
  );

  return { license_key: licenseKey, expires_at: expiresAt, plan: order.plan };
}

export function generateLicenseKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if ((i + 1) % 4 === 0 && i !== 15) out += "-";
  }
  return out;
}
