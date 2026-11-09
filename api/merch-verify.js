import crypto from "node:crypto";
import { fulfillMerchOrder } from "../lib/fulfillMerch.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();
      const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
      if (expected !== razorpay_signature) {
        return jsonResponse({ error: "Payment signature verification failed." }, { status: 400 });
      }
      const result = await fulfillMerchOrder(razorpay_order_id, razorpay_payment_id);
      return jsonResponse(result);
    } catch (err) {
      console.error("merch-verify error:", err);
      return jsonResponse({ error: "Could not verify payment." }, { status: 500 });
    }
  }
};
