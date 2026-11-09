import { supabase } from "../lib/db.js";
import { MERCH } from "../lib/merch.js";
import { sendMerchShippedEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Owner-only: mark an order as shipped and email the customer the tracking details.
// Protected by the ADMIN_TOKEN environment variable.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    try {
      const { token, order_ref, courier, tracking_no } = await request.json();
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return jsonResponse({ error: "Not allowed." }, { status: 401 });
      }
      if (!order_ref || !courier || !tracking_no) {
        return jsonResponse({ error: "Order number, courier and tracking number are required." }, { status: 400 });
      }
      const { data: order, error } = await supabase.from("merch_orders")
        .update({ status: "shipped", courier: String(courier).slice(0, 60), tracking_no: String(tracking_no).slice(0, 60), shipped_at: new Date().toISOString() })
        .eq("order_ref", String(order_ref).trim().toUpperCase())
        .in("status", ["paid", "printing", "shipped"])
        .select().maybeSingle();
      if (error) throw error;
      if (!order) return jsonResponse({ error: "Paid order not found for that number." }, { status: 404 });
      await sendMerchShippedEmail({ order, label: MERCH[order.product]?.label || order.product });
      return jsonResponse({ ok: true, order_ref: order.order_ref, email: order.email });
    } catch (err) {
      console.error("merch-ship error:", err);
      return jsonResponse({ error: "Could not update the order." }, { status: 500 });
    }
  }
};
