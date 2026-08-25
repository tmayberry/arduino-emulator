import type { AccelerometerReading } from "../emulator/workerProtocol";
import { decodePairingDescription, encodePairingDescription } from "./pairing";

export const ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};
const ICE_GATHERING_TIMEOUT_MS = 20_000;
const CONNECTION_TIMEOUT_MS = 30_000;

export type PeerStatus =
  | "idle"
  | "gathering"
  | "waiting"
  | "connecting"
  | "connected"
  | "failed"
  | "closed";

interface SensorPacket extends AccelerometerReading {
  version: 1;
  type: "acceleration";
  sequence: number;
  timestampMs: number;
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  const hasRelayCandidate = () => peer.localDescription?.sdp?.includes(" typ relay ") ?? false;
  const relayUnavailableError = () => new Error(
    "Could not reach the secure TURN relay on TCP port 443. This device may have a managed WebRTC restriction.",
  );
  if (peer.iceGatheringState === "complete") {
    return hasRelayCandidate() ? Promise.resolve() : Promise.reject(relayUnavailableError());
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      if (hasRelayCandidate()) resolve();
      else reject(relayUnavailableError());
    }, ICE_GATHERING_TIMEOUT_MS);
    const handleState = () => {
      if (peer.iceGatheringState === "complete") {
        cleanup();
        if (hasRelayCandidate()) resolve();
        else reject(relayUnavailableError());
      }
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", handleState);
    };
    peer.addEventListener("icegatheringstatechange", handleState);
  });
}

function isSensorPacket(value: unknown): value is SensorPacket {
  return Boolean(
    value &&
      typeof value === "object" &&
      "version" in value &&
      value.version === 1 &&
      "type" in value &&
      value.type === "acceleration" &&
      "x" in value && Number.isFinite(Number(value.x)) &&
      "y" in value && Number.isFinite(Number(value.y)) &&
      "z" in value && Number.isFinite(Number(value.z)) &&
      "sequence" in value && Number.isInteger(Number(value.sequence)) &&
      "timestampMs" in value && Number.isFinite(Number(value.timestampMs)),
  );
}

abstract class AccelerometerPeer {
  protected readonly peer: RTCPeerConnection;
  private connectionTimer: number | undefined;

  constructor(
    protected readonly onStatus: (status: PeerStatus) => void,
    iceServers: RTCIceServer[] = ICE_CONFIGURATION.iceServers ?? [],
  ) {
    this.peer = new RTCPeerConnection({ iceServers });
    this.peer.addEventListener("connectionstatechange", () => {
      const state = this.peer.connectionState;
      if (state === "connected") {
        this.clearConnectionTimer();
        this.onStatus("connected");
      } else if (state === "failed" || state === "disconnected") {
        this.clearConnectionTimer();
        this.onStatus("failed");
      } else if (state === "closed") {
        this.clearConnectionTimer();
        this.onStatus("closed");
      }
    });
  }

  protected startConnectionTimer(): void {
    this.clearConnectionTimer();
    this.connectionTimer = window.setTimeout(() => {
      if (this.peer.connectionState !== "connected") {
        this.onStatus("failed");
        this.peer.close();
      }
    }, CONNECTION_TIMEOUT_MS);
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer !== undefined) {
      window.clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }
  }

  close(): void {
    this.clearConnectionTimer();
    this.peer.close();
    this.onStatus("closed");
  }
}

export class DesktopAccelerometerPeer extends AccelerometerPeer {
  private readonly channel: RTCDataChannel;

  constructor(
    onStatus: (status: PeerStatus) => void,
    onReading: (reading: AccelerometerReading, receivedAtMs: number) => void,
    iceServers?: RTCIceServer[],
  ) {
    super(onStatus, iceServers);
    this.channel = this.peer.createDataChannel("accelerometer-v1", {
      ordered: false,
      maxRetransmits: 0,
    });
    this.channel.addEventListener("message", (event) => {
      try {
        const packet: unknown = JSON.parse(String(event.data));
        if (isSensorPacket(packet)) {
          onReading({ x: Number(packet.x), y: Number(packet.y), z: Number(packet.z) }, Date.now());
        }
      } catch {
        // Ignore malformed peer messages.
      }
    });
  }

  async createOffer(): Promise<string> {
    this.onStatus("gathering");
    await this.peer.setLocalDescription(await this.peer.createOffer());
    await waitForIceGathering(this.peer);
    if (!this.peer.localDescription) throw new Error("Could not create a pairing offer.");
    this.onStatus("waiting");
    return encodePairingDescription("offer", this.peer.localDescription);
  }

  async acceptAnswer(answerToken: string): Promise<void> {
    if (
      this.peer.signalingState === "stable" &&
      this.peer.remoteDescription?.type === "answer"
    ) {
      return;
    }
    if (this.peer.signalingState !== "have-local-offer") {
      throw new Error("This pairing session is no longer waiting for an answer. Start pairing again.");
    }
    this.onStatus("connecting");
    await this.peer.setRemoteDescription(
      decodePairingDescription(answerToken, "answer"),
    );
    this.startConnectionTimer();
  }
}

export class PhoneAccelerometerPeer extends AccelerometerPeer {
  private channel: RTCDataChannel | null = null;
  private sequence = 0;

  constructor(onStatus: (status: PeerStatus) => void, iceServers?: RTCIceServer[]) {
    super(onStatus, iceServers);
    this.peer.addEventListener("datachannel", (event) => {
      this.channel = event.channel;
    });
  }

  async createAnswer(offerToken: string): Promise<string> {
    this.onStatus("gathering");
    await this.peer.setRemoteDescription(
      decodePairingDescription(offerToken, "offer"),
    );
    await this.peer.setLocalDescription(await this.peer.createAnswer());
    await waitForIceGathering(this.peer);
    if (!this.peer.localDescription) throw new Error("Could not create a pairing answer.");
    this.onStatus("waiting");
    this.startConnectionTimer();
    return encodePairingDescription("answer", this.peer.localDescription);
  }

  send(reading: AccelerometerReading, timestampMs: number): void {
    if (!this.channel || this.channel.readyState !== "open") return;
    this.channel.send(JSON.stringify({
      version: 1,
      type: "acceleration",
      sequence: this.sequence++,
      timestampMs,
      ...reading,
    } satisfies SensorPacket));
  }
}
