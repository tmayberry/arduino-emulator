import { compressSync, decompressSync, strFromU8, strToU8 } from "fflate";

export const PHONE_HASH_PREFIX = "#phone=";

interface PairingEnvelope {
  version: 1;
  kind: "offer" | "answer";
  description: RTCSessionDescriptionInit;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodePairingDescription(
  kind: PairingEnvelope["kind"],
  description: RTCSessionDescriptionInit,
): string {
  return bytesToBase64Url(
    compressSync(strToU8(JSON.stringify({ version: 1, kind, description }))),
  );
}

export function decodePairingDescription(
  token: string,
  expectedKind: PairingEnvelope["kind"],
): RTCSessionDescriptionInit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(decompressSync(base64UrlToBytes(token.trim()))));
  } catch {
    throw new Error("That QR code does not contain valid pairing data.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("kind" in parsed) ||
    parsed.kind !== expectedKind ||
    !("description" in parsed) ||
    !parsed.description ||
    typeof parsed.description !== "object" ||
    !("type" in parsed.description) ||
    parsed.description.type !== expectedKind ||
    !("sdp" in parsed.description) ||
    typeof parsed.description.sdp !== "string"
  ) {
    throw new Error(`That QR code is not a compatible WebRTC ${expectedKind}.`);
  }
  return parsed.description as RTCSessionDescriptionInit;
}

export function makePhonePairingUrl(offerToken: string): string {
  return `${location.href.split("#")[0]}${PHONE_HASH_PREFIX}${offerToken}`;
}

export function getPhoneOfferToken(hash = location.hash): string | null {
  return hash.startsWith(PHONE_HASH_PREFIX)
    ? hash.slice(PHONE_HASH_PREFIX.length)
    : null;
}
