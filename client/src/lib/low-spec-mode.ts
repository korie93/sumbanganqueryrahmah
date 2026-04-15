import { getBrowserLocalStorage, safeGetStorageItem } from "@/lib/browser-storage";

type NavigatorPerformanceHints = Navigator & {
  connection?: {
    saveData?: boolean;
  };
  deviceMemory?: number;
};

export function detectLowSpecMode(
  navigatorLike: NavigatorPerformanceHints | undefined = typeof navigator !== "undefined"
    ? navigator as NavigatorPerformanceHints
    : undefined,
) {
  const perfOverride = safeGetStorageItem(getBrowserLocalStorage(), "perf_mode");
  if (perfOverride === "low") return true;
  if (perfOverride === "high") return false;

  if (!navigatorLike) {
    return false;
  }

  const lowCoreHint =
    typeof navigatorLike.hardwareConcurrency === "number"
    && navigatorLike.hardwareConcurrency > 0
    && navigatorLike.hardwareConcurrency <= 4;
  const lowMemoryHint =
    typeof navigatorLike.deviceMemory === "number"
    && navigatorLike.deviceMemory > 0
    && navigatorLike.deviceMemory <= 4;
  const saveData = navigatorLike.connection?.saveData === true;

  return saveData || lowCoreHint || lowMemoryHint;
}
