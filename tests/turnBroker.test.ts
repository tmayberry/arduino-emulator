import { describe, expect, it } from "vitest";
import { selectFirewallFriendlyIceServers } from "../src/phone/turnBroker";

describe("TURN browser configuration", () => {
  it("uses only Cloudflare TURN-over-TLS on TCP 443", () => {
    const result = selectFirewallFriendlyIceServers([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:3478?transport=tcp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "temporary-user",
        credential: "temporary-password",
      },
    ]);

    expect(result).toEqual([
      {
        urls: ["turns:turn.cloudflare.com:443?transport=tcp"],
        username: "temporary-user",
        credential: "temporary-password",
      },
    ]);
  });

  it("does not accept an unrelated secure TURN hostname", () => {
    expect(
      selectFirewallFriendlyIceServers([
        { urls: "turns:example.com:443?transport=tcp" },
      ]),
    ).toEqual([]);
  });
});
