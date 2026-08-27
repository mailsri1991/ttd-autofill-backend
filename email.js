// Sends the license key by email via Brevo's transactional email API.
// https://developers.brevo.com/reference/sendtransacemail

export async function sendLicenseEmail({ to, licenseKey, plan, expiresAt }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set — skipping email send. License key:", licenseKey);
    return;
  }

  const expiryStr = new Date(expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "TTD Darshan Autofill" },
    to: [{ email: to }],
    subject: "Your TTD Darshan Autofill license key",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">You're all set!</h2>
        <p>Thanks for your purchase (${plan} plan). Here's your license key:</p>
        <p style="font-size: 20px; font-weight: bold; letter-spacing: 1px; background:#f5f0ea; padding: 10px 14px; border-radius: 6px; display:inline-block;">${licenseKey}</p>
        <p>Paste this into the extension's popup under "License" and click Activate.</p>
        <p>It's valid until: <strong>${expiryStr}</strong></p>
        <p style="color:#777; font-size: 13px; margin-top: 20px;">Keep this email — you can also use this key on another browser if needed.</p>
      </div>
    `
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Brevo send failed:", res.status, text);
  }
}
