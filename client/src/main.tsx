import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { reportClientError } from "./lib/client-error-telemetry";
import { installGlobalUnhandledRejectionHandler } from "./lib/global-unhandled-rejection";
import { installGlobalWindowErrorHandler } from "./lib/global-window-error";
import { detectLowSpecMode } from "./lib/low-spec-mode";
import { initializeWebVitalsReporting } from "./lib/web-vitals";
import { startFaviconStatus } from "./app/favicon-status";
import offlineFavicon from "./assets/favicon-status/offline-32.png?inline";
import "./styles/tokens/index.css";
import "./public-shell.css";
import "./styles/theme/index.css";

installGlobalUnhandledRejectionHandler({
  productionReporter: (_message, reason) => {
    reportClientError({
      source: "unhandled_rejection",
      error: reason,
    });
  },
});
installGlobalWindowErrorHandler({
  productionReporter: (error) => {
    reportClientError({
      source: "window_error",
      error,
    });
  },
});

if (detectLowSpecMode()) {
  document.documentElement.classList.add("low-spec");
  document.body.classList.add("low-spec");
}

initializeWebVitalsReporting();

const stopFaviconStatus = startFaviconStatus(offlineFavicon);
if (import.meta.hot) import.meta.hot.dispose(stopFaviconStatus);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("SQR app root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
