import { supabase } from "../lib/db.js";
import { sendChatNotificationEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";
import { matchFaq } from "../lib/faq.js";

// Called by the widget whenever a visitor sends a message OR a screenshot (the two
// share this one endpoint rather than a separate api/chat-upload.js route — Vercel's
// Hobby plan caps a deployment at 12 serverless functions, so this file also does the
// image upload that used to live in its own route). Creates a new thread the first
// time (no threadId yet), reuses it after that. Every message also triggers an email
// to the support inbox — unconditionally, not just when support is "offline" — so
// nothing is ever missed just because the admin page wasn't open.
//
// Body (JSON): { threadId?, name, email, message?, fileName?, mimeType?, dataBase64? }
// Either `message` or the three file fields (or both — an image with a caption) must
// be present. dataBase64 is the raw base64 payload with no "data:...;base64," prefix.
//
// Other behaviors:
//  - Reopen on reply: if the thread the visitor is writing into was marked "closed"
//    (e.g. by the 24h auto-close cron), a new visitor message reopens it.
//  - FAQ auto-reply: the first plain-text visitor message on a thread is checked
//    against a starter FAQ list (lib/faq.js); a match gets an immediate canned "bot"
//    reply. Only fires once per thread (gated by chat_threads.auto_replied), and never
//    for an image-only message (there's no question text to match against).
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — comfortably under Vercel's request body limit
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const BUCKET = "chat-attachments";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const { threadId, name, email, message, fileName, mimeType, dataBase64 } = await request.json();
      const text = (message || "").trim();
      const visitorEmail = (email || "").trim();
      const visitorName = (name || "").trim();
      const hasImage = !!(fileName && mimeType && dataBase64);

      if (!text && !hasImage) return jsonResponse({ error: "Message is empty." }, { status: 400 });
      if (!visitorEmail || !visitorEmail.includes("@")) {
        return jsonResponse({ error: "A valid email is required." }, { status: 400 });
      }

      let buffer = null;
      if (hasImage) {
        if (!ALLOWED_TYPES.includes(mimeType)) {
          return jsonResponse({ error: "Only PNG, JPEG, WEBP or GIF screenshots are supported." }, { status: 400 });
        }
        buffer = Buffer.from(dataBase64, "base64");
        if (buffer.length > MAX_BYTES) {
          return jsonResponse({ error: "Image is too large (max 4MB)." }, { status: 400 });
        }
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

      let attachmentUrl = null;
      if (hasImage) {
        const ext = (mimeType.split("/")[1] || "png").replace("jpeg", "jpg");
        const path = `${thread_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
          contentType: mimeType,
          upsert: false
        });
        if (uploadErr) throw uploadErr;
        const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        attachmentUrl = publicUrlData.publicUrl;
      }

      const { error: msgErr } = await supabase
        .from("chat_messages")
        .insert({ thread_id, sender: "visitor", message: text, attachment_url: attachmentUrl });
      if (msgErr) throw msgErr;

      const threadUpdate = { last_message_at: new Date().toISOString() };
      // A visitor writing into a thread that was auto-closed (or manually closed)
      // reopens it — no need to start a new conversation.
      if (existingThread && existingThread.status === "closed") {
        threadUpdate.status = "open";
      }
      await supabase.from("chat_threads").update(threadUpdate).eq("id", thread_id);

      sendChatNotificationEmail({
        visitorName,
        visitorEmail,
        message: text || (hasImage ? "[sent a screenshot]" : ""),
        threadId: thread_id
      }).catch(err => console.error("Failed to send chat notification email:", err));

      // FAQ auto-reply — only once per thread, and only when there's actual text to
      // match against (a bare screenshot isn't a question).
      if (text && (!existingThread || !existingThread.auto_replied)) {
        const faqMatch = matchFaq(text);
        if (faqMatch) {
          await supabase.from("chat_messages").insert({ thread_id, sender: "bot", message: faqMatch.reply });
          await supabase.from("chat_threads").update({ auto_replied: true, last_message_at: new Date().toISOString() }).eq("id", thread_id);
        }
      }

      return jsonResponse({ threadId: thread_id, attachmentUrl });
    } catch (err) {
      console.error("chat-send error:", err);
      return jsonResponse({ error: "Could not send message." }, { status: 500 });
    }
  }
};
