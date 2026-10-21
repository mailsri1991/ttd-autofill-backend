import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Anonymous uninstall feedback from the website's uninstall.html page.
// Stores only the reason, an optional comment and the extension version. No name or email.
const REASONS = ["one_booking", "booking_done", "not_working", "confusing", "price", "mobile", "other"];

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const body = await request.json();
      if (body.website) return jsonResponse({ ok: true }); // honeypot field: bots fill it, people don't
      const reason = String(body.reason || "");
      if (!REASONS.includes(reason)) return jsonResponse({ error: "Please pick a reason." }, { status: 400 });
      const comment = String(body.comment || "").trim().slice(0, 1000) || null;
      const rawV = String(body.v || "").trim();
      const version = /^[0-9.]{1,20}$/.test(rawV) ? rawV : null;

      const { error } = await supabase.from("uninstall_feedback").insert({ reason, comment, version });
      if (error) throw error;
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error("uninstall-feedback error:", err);
      return jsonResponse({ error: "Could not save feedback." }, { status: 500 });
    }
  }
};
