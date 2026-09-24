import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Called repeatedly by the widget (every few seconds while the chat panel is open) to
// pick up new admin replies. `after` is the created_at of the last message the widget
// already has, so this only returns what's new since then.
//
// This same repeated call doubles as the visitor's presence heartbeat: every poll
// stamps chat_threads.visitor_last_seen_at, and the admin dashboard derives an
// "online" badge from how recent that timestamp is (see api/chat-admin.js). No new
// endpoint or extra request needed — a visitor with the widget panel open is already
// polling every 5s, so "online" just means "polled in roughly the last 15-20s".
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const url = new URL(request.url);
      const threadId = url.searchParams.get("threadId");
      const after = url.searchParams.get("after");
      if (!threadId) return jsonResponse({ error: "threadId is required." }, { status: 400 });

      // Fire-and-forget — presence tracking should never slow down or break the
      // actual message fetch below.
      supabase
        .from("chat_threads")
        .update({ visitor_last_seen_at: new Date().toISOString() })
        .eq("id", threadId)
        .then(() => {}, err => console.error("chat-poll presence update failed:", err));

      let query = supabase
        .from("chat_messages")
        .select("id, sender, message, attachment_url, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (after) query = query.gt("created_at", after);

      const { data, error } = await query;
      if (error) throw error;

      return jsonResponse({ messages: data || [] });
    } catch (err) {
      console.error("chat-poll error:", err);
      return jsonResponse({ error: "Could not load messages." }, { status: 500 });
    }
  }
};
