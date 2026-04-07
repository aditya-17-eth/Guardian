import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initSentry } from "./lib/sentry.ts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { MIDNIGHT_NETWORK } from "./lib/constants.ts";

// Must be called before any wallet or contract operation
setNetworkId(MIDNIGHT_NETWORK);

initSentry();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
