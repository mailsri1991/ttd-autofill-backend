import { validateMerchEnquiry } from "./merch.js";
import { supabase } from "./db.js";
import { jsonResponse, preflightResponse } from "./cors.js";
import { sendBulkEnquiryOwnerEmail, sendBulkEnquiryAckEmail } from "./email.js";

// Bulk / company enquiry: saves the request (with logo) and emails the owner
// and the customer. No payment here: the owner replies with a quote and proof.
export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, { status: 405 });

    try {
      const body = await request.json();
      if (body.website) return jsonResponse({ ok: true, enquiry_ref: "BULK" }); // spam trap field
      const v = validateMerchEnquiry(body);
      if (!v.ok) return jsonResponse({ error: v.error }, { status: 400 });
      const d = v.data;

      const { data: row, error } = await supabase.from("merch_enquiries").insert({
        product: d.product, qty: d.qty,
        print_name: d.print_name, print_line2: d.print_line2 || null,
        contact_name: d.contact_name, company: d.company || null,
        phone: d.phone, email: d.email, city: d.city || null,
        gstin: d.gstin || null, needed_by: d.needed_by || null, notes: d.notes || null,
        logo_data: d.logo || null,
        status: "new"
      }).select("enquiry_ref").single();
      if (error) throw error;

      const enquiry = { ...d, enquiry_ref: row.enquiry_ref, has_logo: !!d.logo };
      const logo = d.logo ? { type: d.logo_type, b64: d.logo_b64 } : null;
      try { await sendBulkEnquiryOwnerEmail({ enquiry, logo }); } catch (e) { console.error("bulk owner email failed:", e); }
      try { await sendBulkEnquiryAckEmail({ enquiry }); } catch (e) { console.error("bulk ack email failed:", e); }

      return jsonResponse({ ok: true, enquiry_ref: row.enquiry_ref });
    } catch (err) {
      console.error("merch enquiry error:", err);
      return jsonResponse({ error: "Could not send your enquiry. Please try again or email support@ttddarshanautofill.com." }, { status: 500 });
    }
  }
};
