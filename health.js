import { jsonResponse } from "../lib/cors.js";

export default {
  async fetch() {
    return jsonResponse({ ok: true });
  }
};
