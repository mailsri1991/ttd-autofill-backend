import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Called repeatedly by the widget (every few seconds while the chat panel is open) to
// pick up new admin replies. `after` is the created_at of the last message the widget
// already has, so this only returns what's new since then.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const url = new URL(request.url);
      const threadId = url.searchParams.get("threadId");
      const after = url.searchParams.get("after");
      if (!threadId) return jsonResponse({ error: "threadId is required." }, { status: 400 });

      let query = supabase
        .from("chat_messages")
        .select("id, sender, message, created_at")
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
