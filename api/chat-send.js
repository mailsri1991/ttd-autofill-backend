import { supabase } from "../lib/db.js";
import { sendChatNotificationEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";
import { matchFaq } from "../lib/faq.js";

// Called by the widget whenever a visitor sends a message. Creates a new thread the
// first time (no threadId yet), reuses it after that. Every message also triggers an
// email to the support inbox — unconditionally, not just when support is "offline" —
// so nothing is ever missed just because the admin page wasn't open.
//
// Two extra behaviors:
//  - Reopen on reply: if the thread the visitor is writing into was marked "closed"
//    (e.g. by the 24h auto-close cron), a new visitor message reopens it.
//  - FAQ auto-reply: the first visitor message on a thread is checked against a
//    starter FAQ list (lib/faq.js); a match gets an immediate canned "bot" reply so
//    the visitor isn't left waiting in chat for an answer to a common question. This
//    only ever fires once per thread (gated by chat_threads.auto_replied).
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
      let existingThread = null;

      if (thread_id) {
        const { data: existing } = await supabase
          .from("chat_threads")
          .select("id, status, auto_replied")
          .eq("id", thread_id)
          .maybeSingle();
        if (!existing) thread_id = null;
        else existingThread = existing;
      }

      if (!thread_id) {
        const { data: newThread, error: threadErr } = await supabase
          .from("chat_threads")
          .insert({ visitor_name: visitorName, visitor_email: visitorEmail })
          .select()
          .single();
        if (threadErr) throw threadErr;
        thread_id = newThread.id;
        existingThread = newThread;
      }

      const { error: msgErr } = await supabase
        .from("chat_messages")
        .insert({ thread_id, sender: "visitor", message: text });
      if (msgErr) throw msgErr;

      const threadUpdate = { last_message_at: new Date().toISOString() };
      // A visitor writing into a thread that was auto-closed (or manually closed)
      // reopens it — no need to start a new conversation.
      if (existingThread && existingThread.status === "closed") {
        threadUpdate.status = "open";
      }
      await supabase.from("chat_threads").update(threadUpdate).eq("id", thread_id);

      sendChatNotificationEmail({ visitorName, visitorEmail, message: text, threadId: thread_id }).catch(err =>
        console.error("Failed to send chat notification email:", err)
      );

      // FAQ auto-reply — only once per thread.
      if (!existingThread || !existingThread.auto_replied) {
        const faqMatch = matchFaq(text);
        if (faqMatch) {
          await supabase.from("chat_messages").insert({ thread_id, sender: "bot", message: faqMatch.reply });
          await supabase.from("chat_threads").update({ auto_replied: true, last_message_at: new Date().toISOString() }).eq("id", thread_id);
        }
      }

      return jsonResponse({ threadId: thread_id });
    } catch (err) {
      console.error("chat-send error:", err);
      return jsonResponse({ error: "Could not send message." }, { status: 500 });
    }
  }
};
