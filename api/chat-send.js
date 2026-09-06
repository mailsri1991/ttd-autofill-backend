import { supabase } from "../lib/db.js";
import { sendChatNotificationEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Called by the widget whenever a visitor sends a message. Creates a new thread the
// first time (no threadId yet), reuses it after that. Every message also triggers an
// email to the support inbox — unconditionally, not just when support is "offline" —
// so nothing is ever missed just because the admin page wasn't open.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const { threadId, name, email, message } = await request.json();
      const text = (message || "").trim();
      const visitorEmail = (email || "").trim();
      const visitorName = (name || "").trim();

      if (!text) return jsonResponse({ error: "Message is empty." }, { status: 400 });
      if (!visitorEmail || !visitorEmail.includes("@")) {
        return jsonResponse({ error: "A valid email is required." }, { status: 400 });
      }

      let thread_id = threadId;

      if (thread_id) {
        const { data: existing } = await supabase
          .from("chat_threads")
          .select("id")
          .eq("id", thread_id)
          .maybeSingle();
        if (!existing) thread_id = null;
      }

      if (!thread_id) {
        const { data: newThread, error: threadErr } = await supabase
          .from("chat_threads")
          .insert({ visitor_name: visitorName, visitor_email: visitorEmail })
          .select()
          .single();
        if (threadErr) throw threadErr;
        thread_id = newThread.id;
      }

      const { error: msgErr } = await supabase
        .from("chat_messages")
        .insert({ thread_id, sender: "visitor", message: text });
      if (msgErr) throw msgErr;

      await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", thread_id);

      sendChatNotificationEmail({ visitorName, visitorEmail, message: text, threadId: thread_id }).catch(err =>
        console.error("Failed to send chat notification email:", err)
      );

      return jsonResponse({ threadId: thread_id });
    } catch (err) {
      console.error("chat-send error:", err);
      return jsonResponse({ error: "Could not send message." }, { status: 500 });
    }
  }
};
