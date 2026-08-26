// Single source of truth for pricing. Amounts are in paise (Razorpay's unit).
const PLANS = {
  "7d": { days: 7, amountPaise: 9900, label: "7 days" },
  "30d": { days: 30, amountPaise: 29900, label: "30 days" },
  "90d": { days: 90, amountPaise: 69900, label: "90 days" }
};

module.exports = { PLANS };
