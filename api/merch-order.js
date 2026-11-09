import Razorpay from "razorpay";
import { MERCH, validateMerchOrder } from "../lib/merch.js";
import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Creates a Razorpay order for a calendar / diary purchase and stores the
// customer's delivery details. Payment is confirmed later by /api/merch-verify
// (browser) or /api/razorpay-webhook (server), whichever comes first.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, { status: 405 });

    try {
      const v = validateMerchOrder(await request.json());
      if (!v.ok) return jsonResponse({ error: v.error }, { status: 400 });
      const d = v.data;

      const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const order = await rzp.orders.create({
        amount: d.amountPaise,
        currency: "INR",
        receipt: `merch_${Date.now()}`,
        notes: { kind: "merch", product: d.product, qty: String(d.qty), email: d.email }
      });

      const { error } = await supabase.from("merch_orders").insert({
        razorpay_order_id: order.id,
        product: d.product, qty: d.qty, amount_paise: d.amountPaise,
        name: d.name, phone: d.phone, email: d.email,
        address1: d.address1, address2: d.address2 || null,
        city: d.city, state: d.state, pincode: d.pincode,
        status: "created"
      });
      if (error) throw error;

      return jsonResponse({
        order_id: order.id, amount: order.amount, currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
        label: `${MERCH[d.product].label} x ${d.qty}`,
        name: d.name, email: d.email, phone: d.phone
      });
    } catch (err) {
      console.error("merch-order error:", err);
      return jsonResponse({ error: "Could not start the order. Please try again." }, { status: 500 });
    }
  }
};
