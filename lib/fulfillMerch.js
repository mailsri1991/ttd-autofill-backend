import { supabase } from "./db.js";
import { MERCH } from "./merch.js";
import { sendMerchConfirmationEmail, sendMerchOwnerEmail } from "./email.js";

// Marks a calendar / diary order as paid and sends the emails. Idempotent: the
// browser (merch-verify) and the webhook may both call this; only the first
// call that flips status from "created" to "paid" sends emails.
export async function fulfillMerchOrder(razorpayOrderId, razorpayPaymentId) {
  const { data: updated, error } = await supabase
    .from("merch_orders")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("razorpay_order_id", razorpayOrderId)
    .eq("status", "created")
    .select()
    .maybeSingle();
  if (error) throw error;

  let order = updated;
  if (!order) {
    const { data: existing } = await supabase.from("merch_orders").select("*")
      .eq("razorpay_order_id", razorpayOrderId).maybeSingle();
    if (!existing) throw new Error(`Merch order ${razorpayOrderId} not found`);
    return { ok: true, order_ref: existing.order_ref, already_fulfilled: true };
  }

  const label = MERCH[order.product]?.label || order.product;
  try { await sendMerchConfirmationEmail({ order, label }); } catch (e) { console.error("merch confirmation email failed:", e); }
  try { await sendMerchOwnerEmail({ order, label }); } catch (e) { console.error("merch owner email failed:", e); }
  return { ok: true, order_ref: order.order_ref };
}
