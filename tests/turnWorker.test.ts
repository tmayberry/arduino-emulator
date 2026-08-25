/// <reference path="../worker/worker-configuration.d.ts" />

import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index";

const env = {
  ALLOWED_ORIGINS: "https://tmayberry.github.io",
  TURN_CREDENTIAL_TTL_SECONDS: "3600",
  PAIR_GRANT_TTL_SECONDS: "600",
  TURN_KEY_ID: "turn-key-id",
  TURN_API_TOKEN: "turn-api-token",
  COURSE_ACCESS_CODE: "correct horse battery staple",
  PAIR_GRANT_SIGNING_KEY: "test-signing-key-with-at-least-32-characters",
} satisfies Env;

function request(path: string, body: Record<string, string>, origin = "https://tmayberry.github.io") {
  return new Request(`https://broker.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

function turnResponse(): Response {
  return Response.json({
    iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:53?transport=udp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "temporary-user",
        credential: "temporary-password",
      },
    ],
  }, { status: 201 });
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("TURN credential Worker", () => {
  it("exchanges the course code for filtered ICE servers and a phone grant", async () => {
    const fetchMock = vi.fn(async () => turnResponse());
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(request("/v1/pairing/start", {
      accessCode: env.COURSE_ACCESS_CODE,
    }), env);
    const data = await response.json<{ iceServers: RTCIceServer[]; grant: string }>();

    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://tmayberry.github.io");
    expect(data.grant).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(JSON.stringify(data.iceServers)).not.toContain("cloudflare.com:53");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://rtc.live.cloudflare.com/v1/turn/keys/turn-key-id/credentials/generate-ice-servers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer turn-api-token" }),
      }),
    );
  });

  it("accepts the signed grant for the phone but rejects altered grants", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => turnResponse()));
    const startResponse = await worker.fetch(request("/v1/pairing/start", {
      accessCode: env.COURSE_ACCESS_CODE,
    }), env);
    const { grant } = await startResponse.json<{ grant: string }>();

    const accepted = await worker.fetch(request("/v1/pairing/join", { grant }), env);
    const rejected = await worker.fetch(request("/v1/pairing/join", { grant: `${grant}x` }), env);

    expect(accepted.status).toBe(201);
    expect(rejected.status).toBe(401);
  });

  it("rejects incorrect course codes and unapproved browser origins", async () => {
    const fetchMock = vi.fn(async () => turnResponse());
    vi.stubGlobal("fetch", fetchMock);

    const badCode = await worker.fetch(request("/v1/pairing/start", { accessCode: "wrong" }), env);
    const badOrigin = await worker.fetch(request(
      "/v1/pairing/start",
      { accessCode: env.COURSE_ACCESS_CODE },
      "https://example.com",
    ), env);

    expect(badCode.status).toBe(401);
    expect(badOrigin.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
