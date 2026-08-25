/// <reference path="../worker/worker-configuration.d.ts" />

import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index";

interface StoredSession {
  expiresAt: number;
  offerToken: string | null;
  answerToken: string | null;
}

function makeEnv() {
  const sessions = new Map<string, StoredSession>();
  const namespace = {
    getByName(sessionId: string) {
      return {
        async initialize(expiresAt: number) {
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, { expiresAt, offerToken: null, answerToken: null });
          }
        },
        async storeOffer(offerToken: string) {
          const session = sessions.get(sessionId);
          if (!session || session.expiresAt < Date.now() || session.answerToken) return false;
          session.offerToken = offerToken;
          return true;
        },
        async getOffer() {
          const session = sessions.get(sessionId);
          return session && session.expiresAt >= Date.now() ? session.offerToken : null;
        },
        async storeAnswer(answerToken: string) {
          const session = sessions.get(sessionId);
          if (!session || session.expiresAt < Date.now() || !session.offerToken) return false;
          if (session.answerToken && session.answerToken !== answerToken) return false;
          session.answerToken = answerToken;
          return true;
        },
        async getAnswer() {
          const session = sessions.get(sessionId);
          if (!session || session.expiresAt < Date.now()) return { status: "expired" as const };
          return session.answerToken
            ? { status: "ready" as const, answerToken: session.answerToken }
            : { status: "pending" as const };
        },
      };
    },
  };

  return {
    ALLOWED_ORIGINS: "https://tmayberry.github.io",
    TURN_CREDENTIAL_TTL_SECONDS: "3600",
    PAIR_GRANT_TTL_SECONDS: "600",
    TURN_KEY_ID: "turn-key-id",
    TURN_API_TOKEN: "turn-api-token",
    COURSE_ACCESS_CODE: "correct horse battery staple",
    PAIR_GRANT_SIGNING_KEY: "test-signing-key-with-at-least-32-characters",
    PAIRING_SESSIONS: namespace,
  } as unknown as Env;
}

function request(path: string, body: Record<string, string>, origin = "https://tmayberry.github.io") {
  return new Request(`https://broker.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
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

describe("TURN credential and pairing Worker", () => {
  it("completes a role-authorized pairing exchange through a session mailbox", async () => {
    const env = makeEnv();
    const fetchMock = vi.fn(async () => turnResponse());
    vi.stubGlobal("fetch", fetchMock);

    const startResponse = await worker.fetch(request("/v2/pairing/start", {
      accessCode: env.COURSE_ACCESS_CODE,
    }), env);
    const start = await startResponse.json<{
      sessionId: string;
      desktopGrant: string;
      phoneGrant: string;
      iceServers: RTCIceServer[];
    }>();

    expect(startResponse.status).toBe(201);
    expect(startResponse.headers.get("Access-Control-Allow-Origin")).toBe("https://tmayberry.github.io");
    expect(start.sessionId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(start.desktopGrant).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(start.phoneGrant).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(JSON.stringify(start.iceServers)).not.toContain("cloudflare.com:53");

    const base = `/v2/pairing/sessions/${start.sessionId}`;
    const offer = await worker.fetch(request(`${base}/offer`, {
      grant: start.desktopGrant,
      offerToken: "compressed-offer",
    }), env);
    const join = await worker.fetch(request(`${base}/join`, { grant: start.phoneGrant }), env);
    const joined = await join.json<{ offerToken: string; iceServers: RTCIceServer[] }>();
    const pending = await worker.fetch(request(`${base}/poll`, { grant: start.desktopGrant }), env);
    const answer = await worker.fetch(request(`${base}/answer`, {
      grant: start.phoneGrant,
      answerToken: "compressed-answer",
    }), env);
    const ready = await worker.fetch(request(`${base}/poll`, { grant: start.desktopGrant }), env);

    expect(offer.status).toBe(201);
    expect(join.status).toBe(200);
    expect(joined.offerToken).toBe("compressed-offer");
    expect(JSON.stringify(joined.iceServers)).not.toContain("cloudflare.com:53");
    await expect(pending.json()).resolves.toEqual({ status: "pending" });
    expect(answer.status).toBe(201);
    await expect(ready.json()).resolves.toEqual({ status: "ready", answerToken: "compressed-answer" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects altered grants and grants used for the wrong role", async () => {
    const env = makeEnv();
    vi.stubGlobal("fetch", vi.fn(async () => turnResponse()));
    const startResponse = await worker.fetch(request("/v2/pairing/start", {
      accessCode: env.COURSE_ACCESS_CODE,
    }), env);
    const start = await startResponse.json<{
      sessionId: string;
      desktopGrant: string;
      phoneGrant: string;
    }>();
    const base = `/v2/pairing/sessions/${start.sessionId}`;

    const altered = await worker.fetch(request(`${base}/join`, { grant: `${start.phoneGrant}x` }), env);
    const wrongRole = await worker.fetch(request(`${base}/poll`, { grant: start.phoneGrant }), env);

    expect(altered.status).toBe(401);
    expect(wrongRole.status).toBe(401);
  });

  it("rejects incorrect course codes and unapproved browser origins", async () => {
    const env = makeEnv();
    const fetchMock = vi.fn(async () => turnResponse());
    vi.stubGlobal("fetch", fetchMock);

    const badCode = await worker.fetch(request("/v2/pairing/start", { accessCode: "wrong" }), env);
    const badOrigin = await worker.fetch(request(
      "/v2/pairing/start",
      { accessCode: env.COURSE_ACCESS_CODE },
      "https://example.com",
    ), env);

    expect(badCode.status).toBe(401);
    expect(badOrigin.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
