import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// The extension calls this before allowing a fill.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const url = new URL(request.url);
      const key = (url.searchParams.get("key") || "").trim().toUpperCase();
      if (!key) return jsonResponse({ valid: false, reason: "missing_key" }, { status: 400 });

      const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("license_key", key)
        .maybeSingle();

      if (error) throw error;
      if (!data) return jsonResponse({ valid: false, reason: "not_found" });

      const expired = new Date(data.expires_at).getTime() < Date.now();
      if (expired || data.status === "revoked") {
        if (expired && data.status === "active") {
          await supabase.from("licenses").update({ status: "expired" }).eq("id", data.id);
        }
        return jsonResponse({ valid: false, reason: data.status === "revoked" ? "revoked" : "expired", expires_at: data.expires_at });
      }

      return jsonResponse({ valid: true, plan: data.plan, expires_at: data.expires_at, email: data.email });
    } catch (err) {
      console.error("verify-license error:", err);
      return jsonResponse({ valid: false, reason: "server_error" }, { status: 500 });
    }
  }
};
