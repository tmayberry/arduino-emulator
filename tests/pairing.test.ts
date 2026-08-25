import { describe, expect, it } from "vitest";
import { compressSync, strToU8 } from "fflate";
import {
  decodePairingDescription,
  encodePairingDescription,
  getPhoneOfferToken,
} from "../src/phone/pairing";

describe("WebRTC pairing codec", () => {
  it("round-trips compressed session descriptions", () => {
    const description: RTCSessionDescriptionInit = {
      type: "offer",
      sdp: "v=0\r\na=ice-ufrag:classroom\r\na=sctp-port:5000\r\n",
    };
    const token = encodePairingDescription("offer", description);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePairingDescription(token, "offer")).toEqual(description);
  });

  it("uses QR alphanumeric mode for compact answers", () => {
    const description: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: "v=0\r\na=ice-ufrag:classroom\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=sctp-port:5000\r\n",
    };
    const token = encodePairingDescription("answer", description);

    expect(token).toMatch(/^A2:[0-9A-Z $%*+\-./:]+$/);
    expect(decodePairingDescription(token, "answer")).toEqual(description);
  });

  it("continues to decode legacy compressed answers", () => {
    const description: RTCSessionDescriptionInit = { type: "answer", sdp: "v=0\r\n" };
    const bytes = compressSync(strToU8(JSON.stringify({ version: 1, kind: "answer", description })));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const legacyToken = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

    expect(decodePairingDescription(legacyToken, "answer")).toEqual(description);
  });

  it("rejects the wrong pairing direction and reads phone hashes", () => {
    const token = encodePairingDescription("answer", { type: "answer", sdp: "v=0" });
    expect(() => decodePairingDescription(token, "offer")).toThrow(/not a compatible/);
    expect(getPhoneOfferToken(`#phone=${token}`)).toBe(token);
    expect(getPhoneOfferToken("#unrelated")).toBeNull();
  });
});
