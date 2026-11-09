import merchOrder from "../lib/merchOrder.js";
import merchVerify from "../lib/merchVerify.js";
import merchShip from "../lib/merchShip.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

// One function for all calendar / diary actions (keeps the project within
// Vercel's function limit): /api/merch?action=order | verify | ship
const ROUTES = { order: merchOrder, verify: merchVerify, ship: merchShip };

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    const action = new URL(request.url).searchParams.get("action");
    const route = ROUTES[action];
    if (!route) return jsonResponse({ error: "Unknown action." }, { status: 400 });
    return route.fetch(request);
  }
};
