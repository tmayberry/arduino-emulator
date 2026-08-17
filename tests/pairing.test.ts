import { describe, expect, it } from "vitest";
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

  it("rejects the wrong pairing direction and reads phone hashes", () => {
    const token = encodePairingDescription("answer", { type: "answer", sdp: "v=0" });
    expect(() => decodePairingDescription(token, "offer")).toThrow(/not a compatible/);
    expect(getPhoneOfferToken(`#phone=${token}`)).toBe(token);
    expect(getPhoneOfferToken("#unrelated")).toBeNull();
  });
});
