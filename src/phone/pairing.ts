import {
  compressSync,
  decompressSync,
  deflateSync,
  inflateSync,
  strFromU8,
  strToU8,
} from "fflate";

export const PHONE_HASH_PREFIX = "#phone=";
const GRANT_PARAMETER = "grant";

interface PairingEnvelope {
  version: 1;
  kind: "offer" | "answer";
  description: RTCSessionDescriptionInit;
}

const COMPACT_ANSWER_PREFIX = "A2:";
const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

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

function bytesToBase45(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 2) {
    let value = bytes[index];
    if (index + 1 < bytes.length) {
      value = value * 256 + bytes[index + 1];
      const first = value % 45;
      value = Math.floor(value / 45);
      const second = value % 45;
      const third = Math.floor(value / 45);
      result += BASE45_ALPHABET[first] + BASE45_ALPHABET[second] + BASE45_ALPHABET[third];
    } else {
      result += BASE45_ALPHABET[value % 45] + BASE45_ALPHABET[Math.floor(value / 45)];
    }
  }
  return result;
}

function base45ToBytes(value: string): Uint8Array {
  if (value.length % 3 === 1) throw new Error("Invalid Base45 length");
  const bytes: number[] = [];
  for (let index = 0; index < value.length;) {
    const remaining = value.length - index;
    const count = remaining >= 3 ? 3 : 2;
    const digits = Array.from(value.slice(index, index + count), (character) =>
      BASE45_ALPHABET.indexOf(character),
    );
    if (digits.some((digit) => digit < 0)) throw new Error("Invalid Base45 character");
    const decoded = digits[0] + digits[1] * 45 + (digits[2] ?? 0) * 45 * 45;
    if (count === 3) {
      if (decoded > 0xffff) throw new Error("Invalid Base45 value");
      bytes.push(Math.floor(decoded / 256), decoded % 256);
    } else {
      if (decoded > 0xff) throw new Error("Invalid Base45 value");
      bytes.push(decoded);
    }
    index += count;
  }
  return Uint8Array.from(bytes);
}

export function encodePairingDescription(
  kind: PairingEnvelope["kind"],
  description: RTCSessionDescriptionInit,
): string {
  if (kind === "answer") {
    return COMPACT_ANSWER_PREFIX + bytesToBase45(
      deflateSync(strToU8(description.sdp ?? "")),
    );
  }
  return bytesToBase64Url(
    compressSync(strToU8(JSON.stringify({ version: 1, kind, description }))),
  );
}

export function decodePairingDescription(
  token: string,
  expectedKind: PairingEnvelope["kind"],
): RTCSessionDescriptionInit {
  const normalized = token.trim();
  if (normalized.startsWith(COMPACT_ANSWER_PREFIX)) {
    if (expectedKind !== "answer") {
      throw new Error(`That QR code is not a compatible WebRTC ${expectedKind}.`);
    }
    try {
      return {
        type: "answer",
        sdp: strFromU8(inflateSync(base45ToBytes(normalized.slice(COMPACT_ANSWER_PREFIX.length)))),
      };
    } catch {
      throw new Error("That QR code does not contain valid pairing data.");
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(decompressSync(base64UrlToBytes(normalized))));
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

export function makePhonePairingUrl(offerToken: string, grant?: string): string {
  const grantSuffix = grant ? `&${GRANT_PARAMETER}=${encodeURIComponent(grant)}` : "";
  return `${location.href.split("#")[0]}${PHONE_HASH_PREFIX}${offerToken}${grantSuffix}`;
}

export function getPhoneOfferToken(hash = location.hash): string | null {
  if (!hash.startsWith(PHONE_HASH_PREFIX)) return null;
  return hash.slice(PHONE_HASH_PREFIX.length).split("&", 1)[0] || null;
}

export function getPhonePairingGrant(hash = location.hash): string | null {
  if (!hash.startsWith(PHONE_HASH_PREFIX)) return null;
  const separator = hash.indexOf("&");
  if (separator < 0) return null;
  return new URLSearchParams(hash.slice(separator + 1)).get(GRANT_PARAMETER);
}
