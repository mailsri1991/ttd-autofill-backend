// Calendar and diary products. Change prices here only (amounts in paise).
// Delivery is free across India and included in these prices.
export const MERCH = {
  bundle:   { label: "2027 Wall Calendar + Diary", amountPaise: 79900 },
  calendar: { label: "2027 Wall Calendar (A3)",    amountPaise: 54900 },
  diary:    { label: "2027 Panchanga Diary (A5)",  amountPaise: 34900 }
};
export const MAX_QTY = 5;
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
    pincode: clean(body.pincode, 10)
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
  d.amountPaise = MERCH[d.product].amountPaise * d.qty;
  return { ok: true, data: d };
}
