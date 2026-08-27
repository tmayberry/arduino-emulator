import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  LoaderCircle,
  QrCode,
  Smartphone,
  Unplug,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { AccelerometerReading } from "../emulator/workerProtocol";
import { makePhonePairingUrl } from "../phone/pairing";
import {
  publishPairingOffer,
  startTurnPairing,
  waitForPairingAnswer,
} from "../phone/turnBroker";
import { DesktopAccelerometerPeer, type PeerStatus } from "../phone/webrtc";
import { AccelerationVector } from "./AccelerationVector";

interface AccelerometerPanelProps {
  reading: AccelerometerReading;
  dataConnected: boolean;
  onInput(
    reading: AccelerometerReading,
    connected: boolean,
    updatedAtMs: number,
  ): void;
}

const NEUTRAL: AccelerometerReading = { x: 0, y: 0, z: 1 };

function statusLabel(status: PeerStatus, dataConnected: boolean): string {
  if (status === "connected" && !dataConnected) return "Sensor paused";
  const labels: Record<PeerStatus, string> = {
    idle: "Phone not connected",
    gathering: "Preparing secure pairing…",
    waiting: "Waiting for phone",
    connecting: "Connecting…",
    connected: "Phone connected",
    failed: "Connection failed",
    closed: "Phone disconnected",
  };
  return labels[status];
}

export function AccelerometerPanel({
  reading,
  dataConnected,
  onInput,
}: AccelerometerPanelProps) {
  const [peerStatus, setPeerStatus] = useState<PeerStatus>("idle");
  const [offerUrl, setOfferUrl] = useState("");
  const [pairingOpen, setPairingOpen] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState("");
  const peerRef = useRef<DesktopAccelerometerPeer | null>(null);
  const pairingAbortRef = useRef<AbortController | null>(null);
  const lastReadingAtRef = useRef(0);

  const disconnect = () => {
    pairingAbortRef.current?.abort();
    pairingAbortRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    setPeerStatus("idle");
    setPairingOpen(false);
    setOfferUrl("");
    setError("");
    onInput(NEUTRAL, false, Date.now());
  };

  useEffect(
    () => () => {
      pairingAbortRef.current?.abort();
      peerRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        peerStatus === "connected" &&
        lastReadingAtRef.current > 0 &&
        Date.now() - lastReadingAtRef.current > 1_000
      ) {
        onInput(NEUTRAL, false, Date.now());
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [onInput, peerStatus]);

  const beginPairing = async () => {
    disconnect();
    if (!("RTCPeerConnection" in window)) {
      setError(
        "This browser does not support WebRTC. Use a current version of Chrome or Edge.",
      );
      setPairingOpen(true);
      return;
    }
    setPairingOpen(true);
    setError("");
  };

  const preparePairing = async () => {
    setError("");
    setAuthorizing(true);
    const controller = new AbortController();
    pairingAbortRef.current?.abort();
    pairingAbortRef.current = controller;
    let pairing;
    try {
      pairing = await startTurnPairing(accessCode, controller.signal);
    } catch (reason) {
      setAuthorizing(false);
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not authorize phone pairing.",
      );
      return;
    }
    setAccessCode("");
    const peer = new DesktopAccelerometerPeer(
      (status) => {
        setPeerStatus(status);
        if (status === "connected") {
          setPairingOpen(false);
        } else if (status === "failed") {
          setError(
            (current) =>
              current ||
              "The secure connection could not be established. Start pairing again.",
          );
        }
      },
      (nextReading, receivedAtMs) => {
        lastReadingAtRef.current = receivedAtMs;
        onInput(nextReading, true, receivedAtMs);
      },
      pairing.iceServers,
    );
    peerRef.current = peer;
    try {
      const offer = await peer.createOffer();
      await publishPairingOffer(
        pairing.sessionId,
        pairing.desktopGrant,
        offer,
        controller.signal,
      );
      setOfferUrl(makePhonePairingUrl(pairing.sessionId, pairing.phoneGrant));
      const answer = await waitForPairingAnswer(
        pairing.sessionId,
        pairing.desktopGrant,
        controller.signal,
      );
      await peer.acceptAnswer(answer);
      pairingAbortRef.current = null;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setPeerStatus("failed");
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not prepare phone pairing.",
      );
    } finally {
      setAuthorizing(false);
    }
  };

  const magnitude = Math.sqrt(reading.x ** 2 + reading.y ** 2 + reading.z ** 2);
  const connected = peerStatus === "connected";

  return (
    <details className="accelerometer-card">
      <summary className="accelerometer-heading">
        <div>
          <span className="eyebrow">Motion input</span>
          <h3>Phone Accelerometer</h3>
        </div>
        <span className="collapsible-heading-end">
          <span
            className={`connection-pill connection-${connected && dataConnected ? "live" : "idle"}`}
          >
            {statusLabel(peerStatus, dataConnected)}
          </span>
          <ChevronDown
            className="collapse-chevron"
            size={18}
            aria-hidden="true"
          />
        </span>
      </summary>

      <AccelerationVector reading={reading} />

      <div className="acceleration-readout" aria-live="polite">
        <span>
          <b>X</b>
          <strong>{reading.x.toFixed(2)} g</strong>
        </span>
        <span>
          <b>Y</b>
          <strong>{reading.y.toFixed(2)} g</strong>
        </span>
        <span>
          <b>Z</b>
          <strong>{reading.z.toFixed(2)} g</strong>
        </span>
        <span>
          <b>|a|</b>
          <strong>{magnitude.toFixed(2)} g</strong>
        </span>
      </div>
      <p className="threshold-note">
        Red: |X| &gt; 1.5 g · Green: |Y| &gt; 1.5 g
      </p>

      <div className="accelerometer-actions">
        {connected ? (
          <button
            className="secondary-action"
            type="button"
            onClick={disconnect}
          >
            <Unplug size={15} aria-hidden="true" /> Disconnect
          </button>
        ) : (
          <button
            className="primary-action"
            type="button"
            onClick={() => void beginPairing()}
          >
            <Smartphone size={15} aria-hidden="true" /> Connect phone
          </button>
        )}
      </div>

      {pairingOpen && (
        <div className="pairing-backdrop" role="presentation">
          <section
            className="pairing-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pairing-title"
          >
            <button
              className="pairing-close"
              type="button"
              aria-label="Cancel phone pairing"
              onClick={disconnect}
            >
              ×
            </button>
            <QrCode size={24} aria-hidden="true" />
            <h3 id="pairing-title">Pair your phone</h3>
            {error ? (
              <>
                <p className="pairing-error">{error}</p>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void beginPairing()}
                >
                  Try again
                </button>
              </>
            ) : peerStatus === "connecting" ? (
              <div className="pairing-connecting" role="status">
                <LoaderCircle size={32} aria-hidden="true" />
                <p>Answer received. Establishing the secure connection…</p>
              </div>
            ) : offerUrl ? (
              <>
                <p>
                  Scan this code with your phone camera and enable motion
                  access. The laptop will connect automatically.
                </p>
                <div className="pairing-qr">
                  <QRCodeSVG
                    value={offerUrl}
                    size={244}
                    level="L"
                    marginSize={2}
                  />
                </div>
                <p className="pairing-waiting">
                  <LoaderCircle size={16} aria-hidden="true" /> Waiting for
                  phone…
                </p>
              </>
            ) : authorizing ? (
              <p>Preparing a secure direct connection…</p>
            ) : (
              <form
                className="pairing-access-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void preparePairing();
                }}
              >
                <p>
                  Enter the course access code to create a private, reliable
                  phone connection.
                </p>
                <label htmlFor="pairing-access-code">Course access code</label>
                <input
                  id="pairing-access-code"
                  type="password"
                  autoComplete="current-password"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  required
                  autoFocus
                />
                <button className="primary-action" type="submit">
                  Prepare pairing
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </details>
  );
}
