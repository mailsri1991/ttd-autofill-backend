import { supabase } from "../lib/db.js";
import { isAdminAuthorized } from "../lib/chatAuth.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Every action here requires the x-admin-password header to match ADMIN_CHAT_PASSWORD
// (see lib/chatAuth.js) — this whole file is the admin-only side of the chat feature,
// used only by admin-chat.html, never by the public-facing widget.
//   ?action=threads              GET  — list open threads, newest activity first
//   ?action=messages&threadId=…  GET  — full message history for one thread
//   action=reply (POST body)     — send an admin reply into a thread
//   action=toggle (POST body)    — flip the online/offline flag
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    if (!isAdminAuthorized(request)) {
      return jsonResponse({ error: "Not authorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    try {
      if (request.method === "GET" && action === "threads") {
        const { data, error } = await supabase
          .from("chat_threads")
          .select("id, visitor_name, visitor_email, status, last_message_at, created_at")
          .order("last_message_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return jsonResponse({ threads: data || [] });
      }

      if (request.method === "GET" && action === "messages") {
        const threadId = url.searchParams.get("threadId");
        if (!threadId) return jsonResponse({ error: "threadId is required." }, { status: 400 });
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, sender, message, created_at")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return jsonResponse({ messages: data || [] });
      }

      if (request.method === "POST" && action === "reply") {
        const { threadId, message } = await request.json();
        const text = (message || "").trim();
        if (!threadId || !text) return jsonResponse({ error: "threadId and message are required." }, { status: 400 });
        const { error: msgErr } = await supabase
          .from("chat_messages")
          .insert({ thread_id: threadId, sender: "admin", message: text });
        if (msgErr) throw msgErr;
        await supabase.from("chat_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
        return jsonResponse({ ok: true });
      }

      if (request.method === "POST" && action === "toggle") {
        const { online } = await request.json();
        const { error } = await supabase.from("chat_settings").update({ is_online: !!online }).eq("id", 1);
        if (error) throw error;
        return jsonResponse({ ok: true, online: !!online });
      }

      if (request.method === "POST" && action === "close") {
        const { threadId } = await request.json();
        if (!threadId) return jsonResponse({ error: "threadId is required." }, { status: 400 });
        const { error } = await supabase.from("chat_threads").update({ status: "closed" }).eq("id", threadId);
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: "Unknown action." }, { status: 400 });
    } catch (err) {
      console.error("chat-admin error:", err);
      return jsonResponse({ error: "Something went wrong." }, { status: 500 });
    }
  }
};
