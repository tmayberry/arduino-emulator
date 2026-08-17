import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { ChevronDown, QrCode, Smartphone, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { AccelerometerReading } from "../emulator/workerProtocol";
import { makePhonePairingUrl } from "../phone/pairing";
import {
  DesktopAccelerometerPeer,
  type PeerStatus,
} from "../phone/webrtc";
import { AccelerationVector } from "./AccelerationVector";

interface AccelerometerPanelProps {
  reading: AccelerometerReading;
  dataConnected: boolean;
  onInput(reading: AccelerometerReading, connected: boolean, updatedAtMs: number): void;
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
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const peerRef = useRef<DesktopAccelerometerPeer | null>(null);
  const scannerRef = useRef<IScannerControls | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastReadingAtRef = useRef(0);

  const stopScanner = () => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScanning(false);
  };

  const disconnect = () => {
    stopScanner();
    peerRef.current?.close();
    peerRef.current = null;
    setPeerStatus("idle");
    setPairingOpen(false);
    setOfferUrl("");
    setError("");
    onInput(NEUTRAL, false, Date.now());
  };

  useEffect(() => () => {
    scannerRef.current?.stop();
    peerRef.current?.close();
  }, []);

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

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    const reader = new BrowserQRCodeReader();
    void reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (!result || cancelled) return;
      const answer = result.getText();
      scannerRef.current?.stop();
      scannerRef.current = null;
      setScanning(false);
      setError("");
      void peerRef.current?.acceptAnswer(answer).catch((reason: unknown) => {
        setPeerStatus("failed");
        setError(reason instanceof Error ? reason.message : "Could not read the phone's answer.");
      });
    }).then((controls) => {
      if (cancelled) controls.stop();
      else scannerRef.current = controls;
    }).catch((reason: unknown) => {
      setScanning(false);
      setError(
        reason instanceof Error
          ? `Camera unavailable: ${reason.message}`
          : "The laptop camera is unavailable.",
      );
    });
    return () => {
      cancelled = true;
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [scanning]);

  const beginPairing = async () => {
    disconnect();
    if (!("RTCPeerConnection" in window)) {
      setError("This browser does not support WebRTC. Use a current version of Chrome or Edge.");
      setPairingOpen(true);
      return;
    }
    setPairingOpen(true);
    setError("");
    const peer = new DesktopAccelerometerPeer(
      (status) => {
        setPeerStatus(status);
        if (status === "connected") setPairingOpen(false);
      },
      (nextReading, receivedAtMs) => {
        lastReadingAtRef.current = receivedAtMs;
        onInput(nextReading, true, receivedAtMs);
      },
    );
    peerRef.current = peer;
    try {
      const offer = await peer.createOffer();
      setOfferUrl(makePhonePairingUrl(offer));
    } catch (reason) {
      setPeerStatus("failed");
      setError(reason instanceof Error ? reason.message : "Could not prepare phone pairing.");
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
          <span className={`connection-pill connection-${connected && dataConnected ? "live" : "idle"}`}>
            {statusLabel(peerStatus, dataConnected)}
          </span>
          <ChevronDown className="collapse-chevron" size={18} aria-hidden="true" />
        </span>
      </summary>

      <AccelerationVector reading={reading} />

      <div className="acceleration-readout" aria-live="polite">
        <span><b>X</b><strong>{reading.x.toFixed(2)} g</strong></span>
        <span><b>Y</b><strong>{reading.y.toFixed(2)} g</strong></span>
        <span><b>Z</b><strong>{reading.z.toFixed(2)} g</strong></span>
        <span><b>|a|</b><strong>{magnitude.toFixed(2)} g</strong></span>
      </div>
      <p className="threshold-note">Red: |X| &gt; 1.5 g · Green: |Y| &gt; 1.5 g</p>

      <div className="accelerometer-actions">
        {connected ? (
          <button className="secondary-action" type="button" onClick={disconnect}>
            <Unplug size={15} aria-hidden="true" /> Disconnect
          </button>
        ) : (
          <button className="primary-action" type="button" onClick={() => void beginPairing()}>
            <Smartphone size={15} aria-hidden="true" /> Connect phone
          </button>
        )}
      </div>

      {pairingOpen && (
        <div className="pairing-backdrop" role="presentation">
          <section className="pairing-dialog" role="dialog" aria-modal="true" aria-labelledby="pairing-title">
            <button className="pairing-close" type="button" aria-label="Cancel phone pairing" onClick={disconnect}>×</button>
            <QrCode size={24} aria-hidden="true" />
            <h3 id="pairing-title">Pair your phone</h3>
            {error ? (
              <>
                <p className="pairing-error">{error}</p>
                <button className="primary-action" type="button" onClick={() => void beginPairing()}>Retry</button>
              </>
            ) : scanning ? (
              <>
                <p>Point the laptop camera at the answer QR code on your phone.</p>
                <video className="qr-video" ref={videoRef} muted playsInline />
                <button className="secondary-action" type="button" onClick={stopScanner}>Back</button>
              </>
            ) : offerUrl ? (
              <>
                <p>Scan this code with your phone camera, enable motion access, then return here.</p>
                <div className="pairing-qr"><QRCodeSVG value={offerUrl} size={244} level="L" marginSize={2} /></div>
                <button className="primary-action" type="button" onClick={() => setScanning(true)}>
                  Scan phone answer
                </button>
              </>
            ) : (
              <p>Preparing a secure direct connection…</p>
            )}
          </section>
        </div>
      )}
    </details>
  );
}
