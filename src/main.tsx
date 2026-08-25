import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { getPhonePairingGrant, getPhonePairingSessionId } from "./phone/pairing";
import "./styles/main.css";

const DesktopApp = lazy(() => import("./DesktopApp"));
const PhoneRemote = lazy(() =>
  import("./ui/PhoneRemote").then((module) => ({ default: module.PhoneRemote })),
);

const phonePairingSessionId = getPhonePairingSessionId();
const phonePairingGrant = getPhonePairingGrant();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-loading">Loading Arduino Emulator…</div>}>
      {phonePairingSessionId ? (
        <PhoneRemote sessionId={phonePairingSessionId} pairingGrant={phonePairingGrant} />
      ) : <DesktopApp />}
    </Suspense>
  </StrictMode>,
);
