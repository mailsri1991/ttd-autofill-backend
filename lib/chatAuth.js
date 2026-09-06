// Shared guard for the admin-only chat endpoints. Not a full login system — just a
// shared password (set as the ADMIN_CHAT_PASSWORD env var in Vercel) that the admin
// page asks for once and then sends back on every request via the x-admin-password
// header. Good enough for a single-person support inbox; not meant to scale to
// multiple staff accounts.
export function isAdminAuthorized(request) {
  const expected = process.env.ADMIN_CHAT_PASSWORD;
  if (!expected) return false; // fail closed if it was never configured
  const provided = request.headers.get("x-admin-password");
  return !!provided && provided === expected;
}
