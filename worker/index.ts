const TURN_API_BASE_URL = "https://rtc.live.cloudflare.com/v1/turn/keys";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MAX_REQUEST_BYTES = 4_096;

interface GrantPayload {
  version: 1;
  expiresAt: number;
  nonce: string;
}

interface TurnIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface TurnApiResponse {
  iceServers: TurnIceServer[];
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders },
  });
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const origins = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  return origins.includes(origin) ? origin : null;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

async function parseSmallJson(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) throw new Error("request_too_large");
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_json");
  }
  return parsed as Record<string, unknown>;
}

async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const [providedKey, expectedKey] = await Promise.all([
    crypto.subtle.importKey("raw", encoder.encode(provided), algorithm, false, ["sign"]),
    crypto.subtle.importKey("raw", encoder.encode(expected), algorithm, false, ["verify"]),
  ]);
  const comparisonMessage = encoder.encode("arduino-emulator-course-access-code");
  const providedMac = await crypto.subtle.sign("HMAC", providedKey, comparisonMessage);
  return crypto.subtle.verify("HMAC", expectedKey, providedMac, comparisonMessage);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createGrant(env: Env): Promise<string> {
  const ttl = Math.min(Math.max(Number(env.PAIR_GRANT_TTL_SECONDS), 60), 900);
  const payload: GrantPayload = {
    version: 1,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(env.PAIR_GRANT_SIGNING_KEY),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verifyGrant(grant: string, env: Env): Promise<boolean> {
  const parts = grant.split(".");
  if (parts.length !== 2) return false;
  try {
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await signingKey(env.PAIR_GRANT_SIGNING_KEY),
      Uint8Array.from(fromBase64Url(parts[1])),
      new TextEncoder().encode(parts[0]),
    );
    if (!validSignature) return false;
    const payload: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    return Boolean(
      payload &&
        typeof payload === "object" &&
        "version" in payload && payload.version === 1 &&
        "expiresAt" in payload && typeof payload.expiresAt === "number" &&
        payload.expiresAt >= Math.floor(Date.now() / 1000) &&
        "nonce" in payload && typeof payload.nonce === "string",
    );
  } catch {
    return false;
  }
}

function isTurnApiResponse(value: unknown): value is TurnApiResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "iceServers" in value &&
      Array.isArray(value.iceServers) &&
      value.iceServers.every((server) =>
        server &&
        typeof server === "object" &&
        "urls" in server &&
        (typeof server.urls === "string" ||
          (Array.isArray(server.urls) && server.urls.every((url: unknown) => typeof url === "string"))),
      ),
  );
}

async function generateIceServers(env: Env): Promise<TurnIceServer[]> {
  const ttl = Math.min(Math.max(Number(env.TURN_CREDENTIAL_TTL_SECONDS), 300), 86_400);
  const response = await fetch(
    `${TURN_API_BASE_URL}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl }),
    },
  );
  if (!response.ok) {
    console.error(JSON.stringify({
      message: "TURN credential generation failed",
      status: response.status,
    }));
    throw new Error("turn_api_failed");
  }
  const data: unknown = await response.json();
  if (!isTurnApiResponse(data)) throw new Error("invalid_turn_response");
  return data.iceServers
    .map((server) => ({
      ...server,
      urls: Array.isArray(server.urls)
        ? server.urls.filter((url) => !/:(?:53)(?:\?|$)/u.test(url))
        : server.urls,
    }))
    .filter((server) => typeof server.urls === "string" || server.urls.length > 0);
}

async function handlePost(
  request: Request,
  env: Env,
  path: string,
  headers: HeadersInit,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await parseSmallJson(request);
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400, headers);
  }

  if (path === "/v1/pairing/start") {
    const accessCode = typeof body.accessCode === "string" ? body.accessCode : "";
    if (!(await secretMatches(accessCode, env.COURSE_ACCESS_CODE))) {
      return jsonResponse({ error: "The course access code is incorrect." }, 401, headers);
    }
    const [iceServers, grant] = await Promise.all([
      generateIceServers(env),
      createGrant(env),
    ]);
    return jsonResponse({ iceServers, grant }, 201, headers);
  }

  if (path === "/v1/pairing/join") {
    const grant = typeof body.grant === "string" ? body.grant : "";
    if (!(await verifyGrant(grant, env))) {
      return jsonResponse({ error: "This pairing code has expired. Start again on the laptop." }, 401, headers);
    }
    return jsonResponse({ iceServers: await generateIceServers(env) }, 201, headers);
  }

  return jsonResponse({ error: "Not found." }, 404, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (!origin) return jsonResponse({ error: "Origin not allowed." }, 403);
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, {
        ...headers,
        Allow: "POST, OPTIONS",
      });
    }
    if (request.headers.get("Content-Type")?.split(";", 1)[0] !== "application/json") {
      return jsonResponse({ error: "Content-Type must be application/json." }, 415, headers);
    }

    try {
      return await handlePost(request, env, url.pathname, headers);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Pairing broker request failed",
        error: error instanceof Error ? error.message : "unknown",
        path: url.pathname,
      }));
      return jsonResponse({ error: "The pairing service is temporarily unavailable." }, 502, headers);
    }
  },
} satisfies ExportedHandler<Env>;
