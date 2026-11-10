// Calendar and diary products. Change prices here only (amounts in paise).
// Delivery is free across India and included in these prices.
export const MERCH = {
  bundle:   { label: "2027 Wall Calendar + Diary", amountPaise: 79900 },
  calendar: { label: "2027 Wall Calendar (A3)",    amountPaise: 54900 },
  diary:    { label: "2027 Panchanga Diary (A5)",  amountPaise: 34900 }
};
export const MAX_QTY = 5;
// Optional name printed on the calendar footer and diary cover, per set.
export const NAME_FEE_PAISE = 9900;
export const NAME_MAX = 40;
const NAME_OK = /^[A-Za-z0-9 .,&'()\-\/]+$/;
export const BULK_MIN = 25;
export const BULK_MAX = 5000;
export const DELIVERY_TEXT = "10 to 15 working days";

export const STATES = ["Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"];

const clean = (v, max) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// Returns { ok, data } or { ok: false, error }
export function validateMerchOrder(body) {
  const d = {
    product: clean(body.product, 20),
    qty: parseInt(body.qty, 10),
    name: clean(body.name, 80),
    phone: clean(body.phone, 20).replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, ""),
    email: clean(body.email, 120).toLowerCase(),
    address1: clean(body.address1, 160),
    address2: clean(body.address2, 160),
    city: clean(body.city, 60),
    state: clean(body.state, 60),
    pincode: clean(body.pincode, 10),
    personal_name: clean(body.personal_name, NAME_MAX)
  };
  if (!MERCH[d.product]) return { ok: false, error: "Please choose a product." };
  if (!Number.isInteger(d.qty) || d.qty < 1 || d.qty > MAX_QTY) return { ok: false, error: `Quantity must be between 1 and ${MAX_QTY}.` };
  if (d.name.length < 2) return { ok: false, error: "Please enter your full name." };
  if (!/^[6-9]\d{9}$/.test(d.phone)) return { ok: false, error: "Please enter a valid 10-digit mobile number." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return { ok: false, error: "Please enter a valid email address." };
  if (d.address1.length < 8) return { ok: false, error: "Please enter your full address (house, street, area)." };
  if (d.city.length < 2) return { ok: false, error: "Please enter your city or town." };
  if (!STATES.includes(d.state)) return { ok: false, error: "Please choose your state." };
  if (!/^[1-9]\d{5}$/.test(d.pincode)) return { ok: false, error: "Please enter a valid 6-digit PIN code." };
  if (d.personal_name && !NAME_OK.test(d.personal_name)) return { ok: false, error: "The name to print can use English letters, numbers, spaces and . , & ' ( ) - / only." };
  if (d.personal_name && d.personal_name.length < 2) return { ok: false, error: "Please enter the name to print." };
  d.amountPaise = (MERCH[d.product].amountPaise + (d.personal_name ? NAME_FEE_PAISE : 0)) * d.qty;
  return { ok: true, data: d };
}

// Corporate / bulk enquiry (quote by email, no payment on the site).
export function validateMerchEnquiry(body) {
  const d = {
    product: clean(body.product, 20),
    qty: parseInt(body.qty, 10),
    print_name: clean(body.print_name, NAME_MAX),
    print_line2: clean(body.print_line2, 60),
    contact_name: clean(body.contact_name, 80),
    company: clean(body.company, 120),
    phone: clean(body.phone, 20).replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, ""),
    email: clean(body.email, 120).toLowerCase(),
    city: clean(body.city, 60),
    gstin: clean(body.gstin, 15).toUpperCase(),
    needed_by: clean(body.needed_by, 10),
    notes: clean(body.notes, 1000),
    logo: typeof body.logo === "string" ? body.logo : ""
  };
  if (!MERCH[d.product]) return { ok: false, error: "Please choose a product." };
  if (!Number.isInteger(d.qty) || d.qty < BULK_MIN || d.qty > BULK_MAX) return { ok: false, error: `Bulk orders are from ${BULK_MIN} to ${BULK_MAX} copies.` };
  if (d.print_name.length < 2 || !NAME_OK.test(d.print_name)) return { ok: false, error: "Please enter the company name to print (English letters, numbers and . , & ' ( ) - / only)." };
  if (d.print_line2 && !NAME_OK.test(d.print_line2)) return { ok: false, error: "The second line can use English letters, numbers, spaces and . , & ' ( ) - / only." };
  if (d.contact_name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!/^[6-9]\d{9}$/.test(d.phone)) return { ok: false, error: "Please enter a valid 10-digit mobile number." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return { ok: false, error: "Please enter a valid email address." };
  if (d.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(d.gstin)) return { ok: false, error: "Please check the GSTIN (15 characters) or leave it empty." };
  if (d.needed_by && !/^\d{4}-\d{2}-\d{2}$/.test(d.needed_by)) d.needed_by = "";
  if (d.logo) {
    const m = d.logo.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return { ok: false, error: "The logo must be a PNG or JPG image." };
    if (m[2].length > 1500000) return { ok: false, error: "The logo file is too large. Please use a smaller image." };
    d.logo_type = m[1]; d.logo_b64 = m[2];
  }
  return { ok: true, data: d };
}
