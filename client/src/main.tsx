import { createRoot } from "react-dom/client";
import App from "./App";
import { getBrowserLocalStorage, safeGetStorageItem } from "./lib/browser-storage";
import { installGlobalUnhandledRejectionHandler } from "./lib/global-unhandled-rejection";
import { initializeWebVitalsReporting } from "./lib/web-vitals";
import "./public-shell.css";
import "./theme-tokens.css";

type WindowWithBootShell = Window & {
  __SQR_BOOT_SHELL__?: unknown;
};

const detectLowSpecMode = () => {
  const perfOverride = safeGetStorageItem(getBrowserLocalStorage(), "perf_mode");
  if (perfOverride === "low") return true;
  if (perfOverride === "high") return false;

  const navAny = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  const cores = navigator.hardwareConcurrency || 4;
  const memoryGb = navAny.deviceMemory || 4;
  const saveData = Boolean(navAny.connection?.saveData);

  return saveData || cores <= 4 || memoryGb <= 4;
};

if (detectLowSpecMode()) {
  document.documentElement.classList.add("low-spec");
  document.body.classList.add("low-spec");
}

installGlobalUnhandledRejectionHandler();

initializeWebVitalsReporting();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("SQR app root element was not found.");
}

createRoot(rootElement).render(<App />);

if ((window as WindowWithBootShell).__SQR_BOOT_SHELL__) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.documentElement.classList.add("app-ready");
      document.body.classList.add("app-ready");
      document.getElementById("boot-shell")?.remove();
    });
  });
}
