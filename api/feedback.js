import { supabase } from "../lib/db.js";
import { sendFeedbackNotificationEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const { message, email, extensionVersion, lang } = await request.json();
      const text = (message || "").trim();
      if (!text) return jsonResponse({ error: "Message is empty." }, { status: 400 });
      if (text.length > 4000) return jsonResponse({ error: "Message is too long." }, { status: 400 });

      const cleanEmail = (email || "").trim() || null;

      const { error } = await supabase.from("feedback").insert({
        message: text,
        email: cleanEmail,
        extension_version: extensionVersion || null,
        lang: lang || null
      });
      if (error) throw error;

      sendFeedbackNotificationEmail({
        message: text,
        email: cleanEmail,
        extensionVersion,
        lang
      }).catch(err => console.error("Failed to send feedback notification email:", err));

      return jsonResponse({ ok: true });
    } catch (err) {
      console.error("feedback error:", err);
      return jsonResponse({ error: "Could not submit feedback." }, { status: 500 });
    }
  }
};
