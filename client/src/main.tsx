import { createRoot } from "react-dom/client";
import App from "./App";
import "./public-shell.css";
import "./theme-tokens.css";

const detectLowSpecMode = () => {
  const perfOverride = localStorage.getItem("perf_mode");
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

createRoot(document.getElementById("root")!).render(<App />);
