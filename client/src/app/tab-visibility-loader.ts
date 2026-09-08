import type { TabVisibility } from "@/app/types";

/** A later settings broadcast must win even when older HTTP responses arrive last. */
export function createTabVisibilityLoader({
  load,
  onLoaded,
}: {
  load: () => Promise<{ tabs: Record<string, boolean> }>;
  onLoaded: (tabs: TabVisibility) => void;
}) {
  let requestVersion = 0;
  let disposed = false;
  return {
    async refresh() {
      if (disposed) return;
      const version = ++requestVersion;
      let tabs: TabVisibility = null;
      try {
        tabs = (await load()).tabs;
      } catch {
        // Never grant default permissions after an unsuccessful refresh.
      }
      if (!disposed && version === requestVersion) onLoaded(tabs);
    },
    dispose() {
      disposed = true;
      requestVersion += 1;
    },
  };
}

export function isRelevantRoleSettingsUpdate(role: string, detail: unknown): boolean {
  if (!detail || typeof detail !== "object") return true;
  const key = (detail as { key?: unknown }).key;
  if (typeof key !== "string") return true;
  return key.startsWith(`tab_${role}_`) || (role === "admin" && key === "canViewSystemPerformance");
}
