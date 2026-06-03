import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installGlobalUnhandledRejectionHandler } from "./lib/global-unhandled-rejection";
import { detectLowSpecMode } from "./lib/low-spec-mode";
import { initializeWebVitalsReporting } from "./lib/web-vitals";
import "./styles/tokens/index.css";
import "./public-shell.css";

installGlobalUnhandledRejectionHandler();

if (detectLowSpecMode()) {
  document.documentElement.classList.add("low-spec");
  document.body.classList.add("low-spec");
}

initializeWebVitalsReporting();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("SQR app root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
