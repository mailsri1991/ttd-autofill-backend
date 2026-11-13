// Sends the license key by email via Brevo's transactional email API.
// https://developers.brevo.com/reference/sendtransacemail

export async function sendLicenseEmail({ to, licenseKey, plan, expiresAt }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set, skipping email send. License key:", licenseKey);
    return;
  }

  const expiryStr = new Date(expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "TTD Darshan Quickfill" },
    to: [{ email: to }],
    subject: "Your TTD Darshan Quickfill license key",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">You're all set!</h2>
        <p>Thanks for your purchase (${plan} plan). Here's your license key:</p>
        <p style="font-size: 20px; font-weight: bold; letter-spacing: 1px; background:#f5f0ea; padding: 10px 14px; border-radius: 6px; display:inline-block;">${licenseKey}</p>
        <p>Paste this into the extension's popup under "License" and click Activate.</p>
        <p>It's valid until: <strong>${expiryStr}</strong></p>
        <p style="color:#777; font-size: 13px; margin-top: 20px;">Keep this email, you can also use this key on another browser if needed.</p>
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

// Notifies support the moment a checkout starts (an `orders` row is inserted with
// status "created" as soon as Razorpay's order is created, before payment is confirmed
//, see api/create-order.js). This fires on every attempt, including ones that get
// abandoned or fail, which is the point: it's meant to catch abandoned-checkout cases
// early enough to still follow up, not just report confirmed sales.
export async function sendNewOrderNotificationEmail({ email, plan, planLabel, amountPaise, razorpayOrderId }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set, skipping new-order notification email.");
    return;
  }
  const supportEmail = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_INBOX_EMAIL not set, skipping new-order notification email.");
    return;
  }

  const amountRupees = (amountPaise / 100).toFixed(2);

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: "TTD Darshan Quickfill Support" },
    to: [{ email: supportEmail }],
    subject: `Checkout started, ${planLabel || plan}, ${email}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
        <h2 style="color:#b5451b;">Someone just started checkout</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Plan:</strong> ${planLabel || plan} (₹${amountRupees})</p>
        <p><strong>Razorpay order ID:</strong> ${razorpayOrderId}</p>
        <p style="color:#777; font-size: 13px;">This fires as soon as checkout begins, not once payment is confirmed, if you don't get a separate license-key email for this order shortly after, it likely means they didn't complete the payment, which is worth a follow-up.</p>
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
// (Settings panel). Fires unconditionally, same pattern as the new-order
// notification, no dashboard to check, it just lands in the inbox.
export async function sendFeedbackNotificationEmail({ message, email, extensionVersion, lang }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not set, skipping feedback notification email.");
    return;
  }
  const supportEmail = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!supportEmail) {
    console.warn("SUPPORT_INBOX_EMAIL not set, skipping feedback notification email.");
    return;
  }

  const body = {
    sender: { email: process.env.BREVO_SENDER_EMAIL, name: "TTD Darshan Quickfill Support" },
    to: [{ email: supportEmail }],
    ...(email ? { replyTo: { email } } : {}),
    subject: `New extension feedback${email ? `, ${email}` : ""}`,
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

// ---------------------------------------------------------------------------
// Calendar and diary orders
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rupees = (p) => "₹" + (p / 100).toLocaleString("en-IN");
const SITE = "https://www.ttddarshanautofill.com";

function merchShell(title, inner) {
  return `<div style="background:#fdf6ea;padding:24px 12px;font-family:Arial,sans-serif;color:#2b1a12">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadbc3;border-radius:10px;overflow:hidden">
    <div style="background:#6e1d10;padding:18px 24px;color:#fdf6ea;font-size:20px;font-weight:bold">${title}</div>
    <div style="padding:22px 24px;font-size:15px;line-height:1.55">${inner}</div>
  </div>
  <p style="text-align:center;font-size:12px;color:#8a7766;margin-top:14px">TTD Darshan Quickfill is an independent service, not affiliated with TTD.<br>${SITE}</p>
</div>`;
}
function orderTable(order, label) {
  const addr = [order.address1, order.address2, `${order.city}, ${order.state} ${order.pincode}`].filter(Boolean).map(esc).join("<br>");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
  <tr><td style="padding:6px 0;color:#5e4a3c;width:38%">Order number</td><td style="padding:6px 0"><b>${esc(order.order_ref)}</b></td></tr>
  <tr><td style="padding:6px 0;color:#5e4a3c">Item</td><td style="padding:6px 0">${esc(label)} x ${order.qty}</td></tr>
  ${order.personal_name ? `<tr><td style="padding:6px 0;color:#5e4a3c">Name to print</td><td style="padding:6px 0"><b>${esc(order.personal_name)}</b> (calendar footer and diary cover)</td></tr>` : ""}
  <tr><td style="padding:6px 0;color:#5e4a3c">Amount paid</td><td style="padding:6px 0">${rupees(order.amount_paise)} (free delivery)</td></tr>
  <tr><td style="padding:6px 0;color:#5e4a3c;vertical-align:top">Delivery to</td><td style="padding:6px 0">${esc(order.name)}<br>${addr}<br>Phone: ${esc(order.phone)}</td></tr>
</table>`;
}
async function brevoSend(body) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) { console.warn("BREVO_API_KEY not set, skipping merch email"); return; }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) console.error("Brevo merch send failed:", res.status, await res.text());
}
const sender = () => ({ email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "TTD Darshan Quickfill" });

export async function sendMerchConfirmationEmail({ order, label }) {
  await brevoSend({
    sender: sender(),
    to: [{ email: order.email, name: order.name }],
    subject: `Order confirmed: ${label} (${order.order_ref})`,
    htmlContent: merchShell("Thank you, your order is confirmed", `
      <p>Namaskaram ${esc(order.name)},</p>
      <p>We have received your payment. Your order will be printed and delivered in <b>10 to 15 working days</b>. We will email you the courier tracking number once it is shipped.</p>
      ${orderTable(order, label)}
      <p style="font-size:13px;color:#5e4a3c">If any detail above is wrong${order.personal_name ? ", including the spelling of the name to print," : ""} just reply to this email within 24 hours and we will correct it before printing.</p>`)
  });
}

export async function sendMerchOwnerEmail({ order, label }) {
  const to = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!to) return;
  await brevoSend({
    sender: sender(),
    to: [{ email: to }],
    replyTo: { email: order.email, name: order.name },
    subject: `New paid order ${order.order_ref}${order.personal_name ? " [NAME PRINT]" : ""}: ${label} x ${order.qty} (${rupees(order.amount_paise)})`,
    htmlContent: merchShell("New calendar / diary order", `
      ${orderTable(order, label)}
      <p style="font-size:13px">Email: ${esc(order.email)}<br>Razorpay order: ${esc(order.razorpay_order_id)}<br>Payment: ${esc(order.razorpay_payment_id)}</p>`)
  });
}

export async function sendMerchShippedEmail({ order, label }) {
  await brevoSend({
    sender: sender(),
    to: [{ email: order.email, name: order.name }],
    subject: `Your order ${order.order_ref} has been shipped`,
    htmlContent: merchShell("Your order is on its way", `
      <p>Namaskaram ${esc(order.name)},</p>
      <p>Your <b>${esc(label)}</b> (order ${esc(order.order_ref)}) has been shipped.</p>
      <p style="font-size:16px;background:#f5ecdc;padding:12px 14px;border-radius:6px">Courier: <b>${esc(order.courier)}</b><br>Tracking number: <b>${esc(order.tracking_no)}</b></p>
      <p>You can track it on the courier's website using this number. Please reply to this email if you need any help.</p>`)
  });
}

const PRODUCT_TEXT = { bundle: "Wall Calendar + Diary", calendar: "Wall Calendar (A3)", diary: "Diary (A5)" };
function enquiryTable(q) {
  const row = (k, v) => v ? `<tr><td style="padding:6px 0;color:#5e4a3c;width:38%;vertical-align:top">${k}</td><td style="padding:6px 0">${v}</td></tr>` : "";
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
  ${row("Enquiry number", `<b>${esc(q.enquiry_ref)}</b>`)}
  ${row("Item", `${esc(PRODUCT_TEXT[q.product] || q.product)} x ${q.qty}`)}
  ${row("Name to print", `<b>${esc(q.print_name)}</b>`)}
  ${row("Second line", esc(q.print_line2))}
  ${row("Logo", q.has_logo ? "Yes (attached)" : "No logo")}
  ${row("Needed by", esc(q.needed_by))}
  ${row("Contact", `${esc(q.contact_name)}${q.company ? ", " + esc(q.company) : ""}<br>Phone: ${esc(q.phone)}<br>Email: ${esc(q.email)}${q.city ? "<br>City: " + esc(q.city) : ""}`)}
  ${row("GSTIN", esc(q.gstin))}
  ${row("Notes", esc(q.notes))}
</table>`;
}
export async function sendBulkEnquiryOwnerEmail({ enquiry, logo }) {
  const to = process.env.SUPPORT_INBOX_EMAIL || process.env.BREVO_SENDER_EMAIL;
  if (!to) return;
  await brevoSend({
    sender: sender(),
    to: [{ email: to }],
    replyTo: { email: enquiry.email, name: enquiry.contact_name },
    subject: `Bulk enquiry ${enquiry.enquiry_ref}: ${PRODUCT_TEXT[enquiry.product] || enquiry.product} x ${enquiry.qty} for ${enquiry.print_name}`,
    htmlContent: merchShell("New bulk / company enquiry", `${enquiryTable(enquiry)}
      <p style="font-size:13px">Reply to this email to send the quote and proof. When they approve, create a Razorpay payment link for the quoted amount.</p>`),
    ...(logo ? { attachment: [{ name: `${enquiry.enquiry_ref}-logo.${logo.type === "jpeg" ? "jpg" : "png"}`, content: logo.b64 }] } : {})
  });
}
export async function sendBulkEnquiryAckEmail({ enquiry }) {
  await brevoSend({
    sender: sender(),
    to: [{ email: enquiry.email, name: enquiry.contact_name }],
    subject: `We have received your bulk enquiry (${enquiry.enquiry_ref})`,
    htmlContent: merchShell("Thank you for your enquiry", `
      <p>Namaskaram ${esc(enquiry.contact_name)},</p>
      <p>We have received your request for personalised 2027 Panchanga calendars and diaries. We will email you a quote and a print proof showing your name${enquiry.has_logo ? " and logo" : ""} within 1 to 2 working days. Nothing is printed or charged until you approve the proof and pay.</p>
      ${enquiryTable(enquiry)}
      <p style="font-size:13px;color:#5e4a3c">To change anything, just reply to this email.</p>`)
  });
}
