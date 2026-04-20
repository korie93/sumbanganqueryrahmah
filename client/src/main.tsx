import { createRoot } from "react-dom/client";
import App from "./App";
import { resolveAppRoot } from "./bootstrap-root";
import { installGlobalUnhandledRejectionHandler } from "./lib/global-unhandled-rejection";
import { installGlobalWindowErrorHandler } from "./lib/global-window-error";
import { detectLowSpecMode } from "./lib/low-spec-mode";
import { initializeWebVitalsReporting } from "./lib/web-vitals";
import "./public-shell.css";
import "./theme-tokens.css";

type WindowWithBootShell = Window & {
  __SQR_BOOT_SHELL__?: unknown;
};

if (detectLowSpecMode()) {
  document.documentElement.classList.add("low-spec");
  document.body.classList.add("low-spec");
}

installGlobalUnhandledRejectionHandler();
installGlobalWindowErrorHandler();

initializeWebVitalsReporting();

createRoot(resolveAppRoot(document)).render(<App />);

if ((window as WindowWithBootShell).__SQR_BOOT_SHELL__) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.documentElement.classList.add("app-ready");
      document.body.classList.add("app-ready");
      document.getElementById("boot-shell")?.remove();
    });
  });
}
