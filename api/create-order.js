import Razorpay from "razorpay";
import { PLANS } from "../lib/plans.js";
import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_ID === "test_placeholder") {
    throw new Error("Razorpay isn't configured yet — set real RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars to accept payments.");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const { email, plan } = await request.json();
      if (!email || !PLANS[plan]) {
        return jsonResponse({ error: "Valid email and plan are required." }, { status: 400 });
      }

      const order = await getRazorpay().orders.create({
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

      return jsonResponse({
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
      return jsonResponse({ error: "Could not create order." }, { status: 500 });
    }
  }
};
