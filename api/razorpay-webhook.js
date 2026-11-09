import crypto from "node:crypto";
import { fulfillOrder } from "../lib/fulfillOrder.js";
import { fulfillMerchOrder } from "../lib/fulfillMerch.js";
import { jsonResponse } from "../lib/cors.js";

export default {
  async fetch(request) {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature");
      const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature !== expected) {
        console.warn("Webhook signature mismatch");
        return new Response("invalid signature", { status: 400 });
      }

      const event = JSON.parse(rawBody);
      if (event.event === "payment.captured" || event.event === "order.paid") {
        const payment = event.payload.payment.entity;
        // Calendar / diary orders carry notes.kind = "merch"; everything else is a pass.
        if (payment.notes && payment.notes.kind === "merch") {
          await fulfillMerchOrder(payment.order_id, payment.id);
        } else {
          await fulfillOrder(payment.order_id, payment.id);
        }
      }
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error("Webhook error:", err);
      return jsonResponse({ ok: false }, { status: 500 });
    }
  }
};
