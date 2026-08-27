import { supabase } from "../lib/db.js";
import { sendLicenseEmail } from "../lib/email.js";
import { PLANS } from "../lib/plans.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// Convenience: re-send a license key if someone lost the email.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;

    try {
      const { email } = await request.json();
      if (!email) return jsonResponse({ error: "Email required." }, { status: 400 });

      const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return jsonResponse({ error: "No license found for that email." }, { status: 404 });

      await sendLicenseEmail({
        to: data.email,
        licenseKey: data.license_key,
        plan: PLANS[data.plan]?.label || data.plan,
        expiresAt: data.expires_at
      });
      return jsonResponse({ ok: true });
    } catch (err) {
      console.error("resend-license error:", err);
      return jsonResponse({ error: "Could not resend license." }, { status: 500 });
    }
  }
};
