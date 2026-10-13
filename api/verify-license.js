import { supabase } from "../lib/db.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const url = new URL(request.url);
      const key = (url.searchParams.get("key") || "").trim().toUpperCase();
      if (!key) return jsonResponse({ valid: false, reason: "missing_key" }, { status: 400 });

      const { data, error } = await supabase.from("licenses").select("*").eq("license_key", key).maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ valid: false, reason: "not_found" });

      // Record which extension version this customer is on. Never blocks the response.
      const rawV = (url.searchParams.get("v") || "").trim();
      const version = /^[0-9.]{1,20}$/.test(rawV) ? rawV : "before 2.10.2";
      try {
        await supabase.from("licenses")
          .update({ last_version: version, last_seen_at: new Date().toISOString() })
          .eq("id", data.id);
      } catch (e) {
        console.error("version log failed:", e);
      }

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
