// Starter auto-reply list for the support chat widget.
//
// This is a STARTER list grounded in the actual product — review and edit the
// `keywords` / `reply` text below before it goes live. A visitor's very first
// message on a thread is checked against these (see api/chat-send.js); the
// first entry whose keywords match is sent back immediately as a `sender:
// "bot"` message, and the thread is flagged `auto_replied = true` so it only
// ever fires once per thread — after that, replies come from a human.
//
// Matching is deliberately simple (case-insensitive substring match against
// the visitor's message) rather than ML-based, so it stays predictable and
// easy to edit.

export const FAQ_ENTRIES = [
    {
    id: "activate_after_payment",
    keywords: ["activate", "license key", "how to activate", "after payment", "after paying"],
    reply:
      "Once you complete payment, your license key is generated right away and — if you had \"Activate automatically in this browser\" checked at checkout — it activates automatically in this browser within a minute, no action needed. " +
      "If it's not showing as active after a few minutes (or you checked out from a different browser/device), open the extension popup → \"License\" tab → paste your key → click Activate. " +
      "Still stuck? Reply here with the email you paid with and we'll help you get the license key sorted."
  },
  {
    id: "resend_license",
    keywords: ["lost my key", "didn't get", "did not get", "resend", "can't find my license", "cant find my license", "no email"],
    reply:
      "No problem — you can resend your own license key without waiting on us: open the extension popup → \"License\" tab → \"Resend license key\" → enter the email you paid with. It'll land in your inbox in a minute."
  },
  {
    id: "autofill_not_working",
    keywords: ["not filling", "not working", "autofill fail", "won't fill", "wont fill", "isn't filling", "isnt filling", "fields empty", "didn't fill", "didn't autofill"],
    reply:
      "Sorry about that — a couple of quick things to try: first, make sure you've saved your devotee/pilgrim details and general details (Email/City/State/Country/Pincode/Gothram) in the extension popup itself, not just typed on the TTD page. Then reload the TTD booking page and click the floating \"Fill all details\" button (or \"Fill Pilgrim Details\" in the popup). If it still doesn't fill, let us know exactly which fields are staying empty and we'll dig in."
  },
  {
    id: "pricing_plans",
    keywords: ["price", "pricing", "plan", "cost", "how much", "subscription"],
    reply:
      "You can see all current plans and pricing on our pricing page (linked from the extension popup's \"License\" tab → \"View plans\"). If you tell us roughly how many booking windows you need coverage for, we can point you to the plan that fits best."
  },
  {
    id: "data_privacy",
    keywords: ["privacy", "where is my data", "data stored", "store my data", "safe to use", "is this safe"],
    reply:
      "Your devotee/pilgrim details are stored locally in your own browser's extension storage — we don't upload or see that data on our servers. Payment and license records are handled securely via Razorpay and our backend, separately from your saved form details."
  },
  {
    id: "ticket_release_time",
    keywords: ["when does", "release time", "next release", "ticket open", "booking open", "reminder"],
    reply:
      "The extension sends you a reminder notification 1 hour before each TTD release window (Arjitha Seva, Angapradakshinam, SriVani, Senior Citizen Darshan, Special Entry, Accommodation, etc.), based on TTD's published monthly schedule. Make sure notifications are allowed for Chrome in your OS settings so these come through."
  }
];

// Returns the first matching FAQ entry for a visitor's message, or null.
export function matchFaq(message) {
  const text = (message || "").toLowerCase();
  if (!text) return null;
  for (const entry of FAQ_ENTRIES) {
    if (entry.keywords.some(k => text.includes(k.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}

// Starter root-cause taxonomy for manually classifying threads in the admin
// dashboard (api/chat-admin.js action=classify). Not ML-assigned — the admin
// picks one from this dropdown per conversation. Review/edit freely.
export const CATEGORIES = [
  "License / Payment",
  "Autofill not working — General Details",
  "Autofill not working — Pilgrim / Devotee rows",
  "Extension install / loading issue",
  "Ticket release timing / reminders",
  "Feature request",
  "Other"
];
