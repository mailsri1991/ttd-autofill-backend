import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Public, read-only: lets the widget show "we usually reply in a few minutes" vs
// "we're offline, we'll email you back" before the visitor even sends anything.
// Purely cosmetic — the offline/online state never affects whether the notification
// email actually gets sent (that always happens, see chat-send.js).
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const { data } = await supabase.from("chat_settings").select("is_online").eq("id", 1).maybeSingle();
      return jsonResponse({ online: !!(data && data.is_online) });
    } catch (err) {
      console.error("chat-status error:", err);
      return jsonResponse({ online: false });
    }
  }
};
