import { supabase } from "../lib/db.js";
import { sendChatNotificationEmail } from "../lib/email.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";
import { isAdminAuthorized } from "../lib/chatAuth.js";

// Handles screenshot/image uploads for the support chat, from BOTH sides:
//  - Visitor (widget): no x-admin-password header. Behaves like chat-send.js —
//    creates a thread on the first message if none exists yet, requires a valid email.
//  - Admin (admin-chat.html): sends x-admin-password. Requires an existing threadId.
//
// Body (JSON): { threadId?, name?, email?, fileName, mimeType, dataBase64 }
// dataBase64 is the raw base64 payload (no "data:image/png;base64," prefix — the
// caller strips that before sending).
//
// Images are stored in the "chat-attachments" Supabase Storage bucket (public, see
// schema.sql) and the message row gets attachment_url set instead of/alongside text.
const MAX_BYTES = 4 * 1024 * 1024; // 4MB — comfortably under Vercel's request body limit
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const BUCKET = "chat-attachments";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

    try {
      const body = await request.json();
      const { fileName, mimeType, dataBase64 } = body;
      if (!fileName || !mimeType || !dataBase64) {
        return jsonResponse({ error: "fileName, mimeType and dataBase64 are required." }, { status: 400 });
      }
      if (!ALLOWED_TYPES.includes(mimeType)) {
        return jsonResponse({ error: "Only PNG, JPEG, WEBP or GIF screenshots are supported." }, { status: 400 });
      }

      const buffer = Buffer.from(dataBase64, "base64");
      if (buffer.length > MAX_BYTES) {
        return jsonResponse({ error: "Image is too large (max 4MB)." }, { status: 400 });
      }

      const isAdmin = isAdminAuthorized(request);
      let thread_id = body.threadId;
      const visitorName = (body.name || "").trim();
      const visitorEmail = (body.email || "").trim();

      if (isAdmin) {
        if (!thread_id) return jsonResponse({ error: "threadId is required." }, { status: 400 });
      } else {
        // Visitor path — mirrors chat-send.js's own thread creation/reuse logic.
        if (!visitorEmail || !visitorEmail.includes("@")) {
          return jsonResponse({ error: "A valid email is required." }, { status: 400 });
        }
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
      }

      const ext = (mimeType.split("/")[1] || "png").replace("jpeg", "jpg");
      const path = `${thread_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: mimeType,
        upsert: false
      });
      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const attachmentUrl = publicUrlData.publicUrl;

      const sender = isAdmin ? "admin" : "visitor";
      const { error: msgErr } = await supabase
        .from("chat_messages")
        .insert({ thread_id, sender, message: "", attachment_url: attachmentUrl });
      if (msgErr) throw msgErr;

      // A visitor attaching an image to a closed thread reopens it too, same as a
      // normal text reply in chat-send.js.
      const threadUpdate = { last_message_at: new Date().toISOString() };
      if (!isAdmin) threadUpdate.status = "open";
      await supabase.from("chat_threads").update(threadUpdate).eq("id", thread_id);

      if (!isAdmin) {
        sendChatNotificationEmail({
          visitorName,
          visitorEmail,
          message: "[sent a screenshot]",
          threadId: thread_id
        }).catch(err => console.error("Failed to send chat notification email:", err));
      }

      return jsonResponse({ ok: true, threadId: thread_id, attachmentUrl });
    } catch (err) {
      console.error("chat-upload error:", err);
      return jsonResponse({ error: "Could not upload the image." }, { status: 500 });
    }
  }
};
