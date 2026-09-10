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

// Notifies support of a new chat message (sent on every visitor message, whether
// support is marked online or offline, so nothing is ever missed even if the admin
// page was never opened). Reply-To is set to the visitor's own email so a normal
// reply from the inbox reaches them directly, as a backup to replying via the admin
// chat page itself.
export async function sendChatNotificationEmail({ visitorName, visitorEmail, message, threadId }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set — skipping chat notification email.");
    return;
  }
  const supportEmail = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_INBOX_EMAIL not set — skipping chat notification email.");
    return;
  }

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: "TTD Darshan Autofill Support" },
    to: [{ email: supportEmail }],
    replyTo: { email: visitorEmail, name: visitorName || visitorEmail },
    subject: `New chat message from ${visitorName || visitorEmail}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">New message via the site chat widget</h2>
        <p><strong>From:</strong> ${visitorName || "(no name given)"} (${visitorEmail})</p>
        <p style="background:#f5f0ea; padding: 10px 14px; border-radius: 6px;">${message}</p>
        <p style="color:#777; font-size: 13px;">Reply to this email to reach them directly, or open the admin chat page to reply in the widget (thread: ${threadId}).</p>
      </div>
    `
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Brevo chat notification send failed:", res.status, text);
  }
}

// Notifies support the moment a checkout starts (an `orders` row is inserted with
// status "created" as soon as Razorpay's order is created, before payment is confirmed
// — see api/create-order.js). This fires on every attempt, including ones that get
// abandoned or fail, which is the point: it's meant to catch abandoned-checkout cases
// early enough to still follow up, not just report confirmed sales.
export async function sendNewOrderNotificationEmail({ email, plan, planLabel, amountPaise, razorpayOrderId }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set — skipping new-order notification email.");
    return;
  }
  const supportEmail = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_INBOX_EMAIL not set — skipping new-order notification email.");
    return;
  }

  const amountRupees = (amountPaise / 100).toFixed(2);

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: "TTD Darshan Autofill Support" },
    to: [{ email: supportEmail }],
    subject: `Checkout started — ${planLabel || plan} — ${email}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">Someone just started checkout</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Plan:</strong> ${planLabel || plan} (₹${amountRupees})</p>
        <p><strong>Razorpay order ID:</strong> ${razorpayOrderId}</p>
        <p style="color:#777; font-size: 13px;">This fires as soon as checkout begins, not once payment is confirmed — if you don't get a separate license-key email for this order shortly after, it likely means they didn't complete the payment, which is worth a follow-up.</p>
      </div>
    `
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Brevo new-order notification send failed:", res.status, text);
  }
}

// Notifies support when someone submits the in-extension "Give us feedback" box
// (Settings panel). Fires unconditionally, same pattern as the chat and new-order
// notifications — no dashboard to check, it just lands in the inbox.
export async function sendFeedbackNotificationEmail({ message, email, extensionVersion, lang }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set — skipping feedback notification email.");
    return;
  }
  const supportEmail = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_INBOX_EMAIL not set — skipping feedback notification email.");
    return;
  }

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: "TTD Darshan Autofill Support" },
    to: [{ email: supportEmail }],
    ...(email ? { replyTo: { email } } : {}),
    subject: `New extension feedback${email ? ` — ${email}` : ""}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">New feedback from the extension</h2>
        <p style="background:#f5f0ea; padding: 10px 14px; border-radius: 6px; white-space: pre-wrap;">${message}</p>
        <p style="color:#777; font-size: 13px;">
          ${email ? `From: ${email}<br/>` : "No license/email on file for this user.<br/>"}
          Extension version: ${extensionVersion || "unknown"}<br/>
          Language: ${lang || "unknown"}
        </p>
      </div>
    `
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Brevo feedback notification send failed:", res.status, text);
  }
}
