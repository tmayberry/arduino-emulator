import { useEffect, useRef, useState } from "react";
import { Activity, CheckCircle2, Maximize2, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { AccelerometerReading } from "../emulator/workerProtocol";
import { phoneMotionToBoardAcceleration, requestMotionPermission } from "../phone/motion";
import { PhoneAccelerometerPeer, type PeerStatus } from "../phone/webrtc";

interface PhoneRemoteProps {
  offerToken: string;
}

const NEUTRAL: AccelerometerReading = { x: 0, y: 0, z: 1 };

export function PhoneRemote({ offerToken }: PhoneRemoteProps) {
  const [status, setStatus] = useState<PeerStatus>("idle");
  const [answerToken, setAnswerToken] = useState("");
  const [reading, setReading] = useState(NEUTRAL);
  const [error, setError] = useState("");
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);
  const [hasReading, setHasReading] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const peerRef = useRef<PhoneAccelerometerPeer | null>(null);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    const handleResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => () => peerRef.current?.close(), []);

  useEffect(() => {
    if (!answerToken) return;
    const handleMotion = (event: DeviceMotionEvent) => {
      const now = performance.now();
      if (now - lastSentAtRef.current < 1000 / 30) return;
      const next = phoneMotionToBoardAcceleration(event.accelerationIncludingGravity);
      if (!next) return;
      lastSentAtRef.current = now;
      setHasReading(true);
      setReading(next);
      peerRef.current?.send(next, Date.now());
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [answerToken]);

  const enable = async () => {
    setError("");
    if (!("RTCPeerConnection" in window) || !("DeviceMotionEvent" in window)) {
      setError("This browser cannot provide the WebRTC motion-sensor features required by the emulator.");
      return;
    }
    try {
      if (!(await requestMotionPermission())) {
        setError("Motion access was denied. Allow Motion & Orientation access and try again.");
        return;
      }
      const peer = new PhoneAccelerometerPeer(setStatus);
      peerRef.current = peer;
      const answer = await peer.createAnswer(offerToken);
      setAnswerToken(answer);
      history.replaceState(null, "", location.href.split("#")[0]);
    } catch (reason) {
      setStatus("failed");
      setError(reason instanceof Error ? reason.message : "Could not create the phone connection.");
    }
  };

  const magnitude = Math.sqrt(reading.x ** 2 + reading.y ** 2 + reading.z ** 2);

  return (
    <main className="phone-remote">
      <header className="phone-header">
        <span><Activity size={20} aria-hidden="true" /></span>
        <div><small>Arduino Emulator</small><h1>Motion Remote</h1></div>
      </header>
      <section className="phone-card">
        {landscape && <p className="phone-warning">Rotate your phone to portrait before collecting data.</p>}
        {!answerToken ? (
          <>
            <Smartphone size={54} strokeWidth={1.4} aria-hidden="true" />
            <h2>Use this phone as the Arduino</h2>
            <p>Hold it in portrait with the top of the phone representing the board’s USB end. Keep this page visible while the sketch runs.</p>
            {error && <p className="phone-error">{error}</p>}
            <button className="phone-primary" type="button" onClick={() => void enable()} disabled={status === "gathering"}>
              {status === "gathering" ? "Preparing…" : "Enable motion sensors"}
            </button>
          </>
        ) : status !== "connected" ? (
          <>
            <h2>Scan this answer on the laptop</h2>
            <p>Click “Scan phone answer” on the laptop, then hold this code in front of its camera.</p>
            <button className="phone-qr-trigger" type="button" onClick={() => setQrExpanded(true)} aria-label="Enlarge answer QR code">
              <div className="phone-qr"><QRCodeSVG value={answerToken} size={420} level="L" marginSize={4} /></div>
              <span><Maximize2 size={15} aria-hidden="true" /> Tap to enlarge</span>
            </button>
            <p className="phone-status">{status === "failed" ? "The direct connection failed. Start pairing again on the laptop." : "Waiting for laptop…"}</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="phone-connected-icon" size={44} aria-hidden="true" />
            <h2>Connected</h2>
            <p>Move and tilt the phone as if it were the Arduino board.</p>
            <div className="phone-readings" aria-live="polite">
              <span><b>X</b><strong>{reading.x.toFixed(2)} g</strong></span>
              <span><b>Y</b><strong>{reading.y.toFixed(2)} g</strong></span>
              <span><b>Z</b><strong>{reading.z.toFixed(2)} g</strong></span>
              <span><b>|a|</b><strong>{magnitude.toFixed(2)} g</strong></span>
            </div>
            {!hasReading && <p className="phone-warning">Waiting for motion readings. Check your browser’s sensor permission.</p>}
            <p className="phone-footnote">Do not lock the phone or switch apps; browsers pause sensor events when this page is hidden.</p>
          </>
        )}
      </section>
      {qrExpanded && status !== "connected" && (
        <div className="phone-qr-fullscreen" role="dialog" aria-modal="true" aria-label="Enlarged answer QR code">
          <button type="button" onClick={() => setQrExpanded(false)} aria-label="Close enlarged QR code">
            <X size={24} aria-hidden="true" />
          </button>
          <QRCodeSVG value={answerToken} size={720} level="L" marginSize={4} />
          <p>Hold the phone steady in front of the laptop camera.</p>
        </div>
      )}
    </main>
  );
}
