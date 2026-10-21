import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Adds an email to the Brevo "TTD release reminders" list.
// Called from welcome.html, uninstall.html and checkout (only when the person ticks the box).
// Needs two Vercel environment variables: BREVO_API_KEY (already set) and BREVO_REMINDER_LIST_ID.
const SOURCES = ["welcome", "uninstall", "checkout", "website"];

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const body = await request.json();
      if (body.website) return jsonResponse({ ok: true }); // honeypot
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
        return jsonResponse({ error: "Please enter a valid email." }, { status: 400 });
      }
      const source = SOURCES.includes(body.source) ? body.source : "website";

      const apiKey = process.env.BREVO_API_KEY;
      const listId = Number(process.env.BREVO_REMINDER_LIST_ID);
      if (!apiKey || !listId) {
        console.warn("subscribe: BREVO_API_KEY or BREVO_REMINDER_LIST_ID missing");
        return jsonResponse({ error: "Reminders are not set up yet." }, { status: 503 });
      }

      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email,
          listIds: [listId],
          updateEnabled: true,
          attributes: { SOURCE: source }
        })
      });
      if (!res.ok && res.status !== 204) {
        const txt = await res.text();
        console.error("Brevo subscribe failed:", res.status, txt);
        return jsonResponse({ error: "Could not subscribe right now." }, { status: 502 });
      }
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error("subscribe error:", err);
      return jsonResponse({ error: "Could not subscribe right now." }, { status: 500 });
    }
  }
};
