const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export function withCors(headers = {}) {
  return { ...CORS_HEADERS, ...headers };
}

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: withCors({ "Content-Type": "application/json", ...(init.headers || {}) })
  });
}

export function preflightResponse(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }
  return null;
}
