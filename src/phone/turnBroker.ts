interface StartPairingResponse {
  iceServers: RTCIceServer[];
  grant: string;
}

const DEFAULT_BROKER_URL = "https://arduino-turn-auth.arduino-emulator.workers.dev";
const configuredUrl = import.meta.env.VITE_TURN_BROKER_URL?.trim() || DEFAULT_BROKER_URL;

function brokerEndpoint(path: string): string {
  return `${configuredUrl.replace(/\/$/u, "")}${path}`;
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object" || !("urls" in value)) return false;
  const urls = value.urls;
  if (typeof urls !== "string" && !(Array.isArray(urls) && urls.every((url) => typeof url === "string"))) {
    return false;
  }
  return (
    (!("username" in value) || value.username === undefined || typeof value.username === "string") &&
    (!("credential" in value) || value.credential === undefined || typeof value.credential === "string")
  );
}

function isStartResponse(value: unknown): value is StartPairingResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "grant" in value && typeof value.grant === "string" &&
      "iceServers" in value && Array.isArray(value.iceServers) &&
      value.iceServers.length > 0 && value.iceServers.every(isIceServer),
  );
}

function isJoinResponse(value: unknown): value is Pick<StartPairingResponse, "iceServers"> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "iceServers" in value && Array.isArray(value.iceServers) &&
      value.iceServers.length > 0 && value.iceServers.every(isIceServer),
  );
}

export function selectFirewallFriendlyIceServers(iceServers: RTCIceServer[]): RTCIceServer[] {
  return iceServers.flatMap((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    const secureUrls = urls.filter((url) =>
      /^turns:turn\.cloudflare\.com:443(?:\?|$)/iu.test(url),
    );
    return secureUrls.length > 0 ? [{ ...server, urls: secureUrls }] : [];
  });
}

function requireFirewallFriendlyIceServers(iceServers: RTCIceServer[]): RTCIceServer[] {
  const selected = selectFirewallFriendlyIceServers(iceServers);
  if (selected.length === 0) {
    throw new Error("The pairing service did not provide its secure TCP 443 relay.");
  }
  return selected;
}

async function post(path: string, body: Record<string, string>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(brokerEndpoint(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the phone pairing service. Check the internet connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "The phone pairing service rejected the request.";
    throw new Error(message);
  }
  return data;
}

export async function startTurnPairing(accessCode: string): Promise<StartPairingResponse> {
  const data = await post("/v1/pairing/start", { accessCode });
  if (!isStartResponse(data)) throw new Error("The phone pairing service returned an invalid response.");
  return { ...data, iceServers: requireFirewallFriendlyIceServers(data.iceServers) };
}

export async function joinTurnPairing(grant: string): Promise<RTCIceServer[]> {
  const data = await post("/v1/pairing/join", { grant });
  if (!isJoinResponse(data)) throw new Error("The phone pairing service returned an invalid response.");
  return requireFirewallFriendlyIceServers(data.iceServers);
}
