import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { getPhoneOfferToken } from "./phone/pairing";
import "./styles/main.css";

const DesktopApp = lazy(() => import("./DesktopApp"));
const PhoneRemote = lazy(() =>
  import("./ui/PhoneRemote").then((module) => ({ default: module.PhoneRemote })),
);

const phoneOfferToken = getPhoneOfferToken();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-loading">Loading Arduino Emulator…</div>}>
      {phoneOfferToken ? <PhoneRemote offerToken={phoneOfferToken} /> : <DesktopApp />}
    </Suspense>
  </StrictMode>,
);
