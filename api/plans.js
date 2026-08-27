import { PLANS } from "../lib/plans.js";
import { jsonResponse, preflightResponse } from "../lib/cors.js";

export default {
  async fetch(request) {
    const preflight = preflightResponse(request);
    if (preflight) return preflight;
    return jsonResponse(PLANS);
  }
};
