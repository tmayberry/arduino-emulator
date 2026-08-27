interface StartPairingResponse {
  sessionId: string;
  desktopGrant: string;
  phoneGrant: string;
  iceServers: RTCIceServer[];
}

interface JoinPairingResponse {
  offerToken: string;
  iceServers: RTCIceServer[];
}

const DEFAULT_BROKER_URL =
  "https://arduino-turn-auth.arduino-emulator.workers.dev";
const configuredUrl =
  import.meta.env.VITE_TURN_BROKER_URL?.trim() || DEFAULT_BROKER_URL;
const POLL_INTERVAL_MS = 1_000;

function brokerEndpoint(path: string): string {
  return `${configuredUrl.replace(/\/$/u, "")}${path}`;
}

function sessionEndpoint(sessionId: string, action: string): string {
  return `/v2/pairing/sessions/${encodeURIComponent(sessionId)}/${action}`;
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object" || !("urls" in value)) return false;
  const urls = value.urls;
  if (
    typeof urls !== "string" &&
    !(Array.isArray(urls) && urls.every((url) => typeof url === "string"))
  ) {
    return false;
  }
  return (
    (!("username" in value) ||
      value.username === undefined ||
      typeof value.username === "string") &&
    (!("credential" in value) ||
      value.credential === undefined ||
      typeof value.credential === "string")
  );
}

function isStartResponse(value: unknown): value is StartPairingResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "desktopGrant" in value &&
    typeof value.desktopGrant === "string" &&
    "phoneGrant" in value &&
    typeof value.phoneGrant === "string" &&
    "iceServers" in value &&
    Array.isArray(value.iceServers) &&
    value.iceServers.length > 0 &&
    value.iceServers.every(isIceServer),
  );
}

function isJoinResponse(value: unknown): value is JoinPairingResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    "offerToken" in value &&
    typeof value.offerToken === "string" &&
    "iceServers" in value &&
    Array.isArray(value.iceServers) &&
    value.iceServers.length > 0 &&
    value.iceServers.every(isIceServer),
  );
}

export function selectFirewallFriendlyIceServers(
  iceServers: RTCIceServer[],
): RTCIceServer[] {
  return iceServers.flatMap((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    const secureUrls = urls.filter((url) =>
      /^turns:turn\.cloudflare\.com:443(?:\?|$)/iu.test(url),
    );
    return secureUrls.length > 0 ? [{ ...server, urls: secureUrls }] : [];
  });
}

function requireFirewallFriendlyIceServers(
  iceServers: RTCIceServer[],
): RTCIceServer[] {
  const selected = selectFirewallFriendlyIceServers(iceServers);
  if (selected.length === 0) {
    throw new Error(
      "The pairing service did not provide its secure TCP 443 relay.",
    );
  }
  return selected;
}

async function post(
  path: string,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(brokerEndpoint(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted)
      throw new DOMException("Pairing cancelled.", "AbortError");
    throw new Error(
      "Could not reach the phone pairing service. Check the internet connection and try again.",
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "The phone pairing service rejected the request.";
    throw new Error(message);
  }
  return data;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Pairing cancelled.", "AbortError"));
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Pairing cancelled.", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function startTurnPairing(
  accessCode: string,
  signal?: AbortSignal,
): Promise<StartPairingResponse> {
  const data = await post("/v2/pairing/start", { accessCode }, signal);
  if (!isStartResponse(data))
    throw new Error("The phone pairing service returned an invalid response.");
  return {
    ...data,
    iceServers: requireFirewallFriendlyIceServers(data.iceServers),
  };
}

export async function publishPairingOffer(
  sessionId: string,
  grant: string,
  offerToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await post(
    sessionEndpoint(sessionId, "offer"),
    { grant, offerToken },
    signal,
  );
}

export async function joinTurnPairing(
  sessionId: string,
  grant: string,
  signal?: AbortSignal,
): Promise<JoinPairingResponse> {
  const data = await post(
    sessionEndpoint(sessionId, "join"),
    { grant },
    signal,
  );
  if (!isJoinResponse(data))
    throw new Error("The phone pairing service returned an invalid response.");
  return {
    ...data,
    iceServers: requireFirewallFriendlyIceServers(data.iceServers),
  };
}

export async function submitPairingAnswer(
  sessionId: string,
  grant: string,
  answerToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await post(
    sessionEndpoint(sessionId, "answer"),
    { grant, answerToken },
    signal,
  );
}

export async function waitForPairingAnswer(
  sessionId: string,
  grant: string,
  signal: AbortSignal,
): Promise<string> {
  while (!signal.aborted) {
    const data = await post(
      sessionEndpoint(sessionId, "poll"),
      { grant },
      signal,
    );
    if (data && typeof data === "object" && "status" in data) {
      if (
        data.status === "ready" &&
        "answerToken" in data &&
        typeof data.answerToken === "string"
      ) {
        return data.answerToken;
      }
      if (data.status === "expired") {
        throw new Error("This pairing session expired. Start pairing again.");
      }
      if (data.status !== "pending") {
        throw new Error(
          "The phone pairing service returned an invalid response.",
        );
      }
    } else {
      throw new Error(
        "The phone pairing service returned an invalid response.",
      );
    }
    await delay(POLL_INTERVAL_MS, signal);
  }
  throw new DOMException("Pairing cancelled.", "AbortError");
}
