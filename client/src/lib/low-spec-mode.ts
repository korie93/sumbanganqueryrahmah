import { getBrowserLocalStorage, safeGetStorageItem } from "./browser-storage";

type LowSpecSignals = {
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
  perfOverride?: string | null | undefined;
  saveData?: boolean | undefined;
};

type LowSpecNavigator = Navigator & {
  connection?: { saveData?: boolean } | undefined;
  deviceMemory?: number | undefined;
};

const DEFAULT_HARDWARE_CONCURRENCY = 4;
const DEFAULT_DEVICE_MEMORY_GB = 4;

export function shouldEnableLowSpecMode(signals: LowSpecSignals): boolean {
  const perfOverride = String(signals.perfOverride || "").trim().toLowerCase();
  if (perfOverride === "low") return true;
  if (perfOverride === "high") return false;

  const cores = Number.isFinite(signals.hardwareConcurrency)
    ? Number(signals.hardwareConcurrency)
    : DEFAULT_HARDWARE_CONCURRENCY;
  const memoryGb = Number.isFinite(signals.deviceMemory)
    ? Number(signals.deviceMemory)
    : DEFAULT_DEVICE_MEMORY_GB;

  return signals.saveData === true || cores <= 2 || memoryGb <= 2;
}

export function detectLowSpecMode(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const nav = navigator as LowSpecNavigator;
  return shouldEnableLowSpecMode({
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    perfOverride: safeGetStorageItem(getBrowserLocalStorage(), "perf_mode"),
    saveData: nav.connection?.saveData,
  });
}
