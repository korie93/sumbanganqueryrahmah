import { useEffect, useMemo, useState } from "react";
import {
  getMonitorSectionVisibility,
  isSuperuserFeatureOffMode,
} from "@/app/monitorAccess";
import type { TabVisibility, User } from "@/app/types";
import { getTabVisibility } from "@/lib/api";
import { createTabVisibilityLoader, isRelevantRoleSettingsUpdate } from "@/app/tab-visibility-loader";

type UseAppShellTabVisibilityArgs = {
  user: User | null;
};

export function useAppShellTabVisibility({ user }: UseAppShellTabVisibilityArgs) {
  const userId = user?.id;
  const username = user?.username;
  const role = user?.role;
  const [tabVisibility, setTabVisibility] = useState<TabVisibility>(null);
  const [tabVisibilityLoaded, setTabVisibilityLoaded] = useState(false);

  const featureLockdown = useMemo(
    () => isSuperuserFeatureOffMode(user?.role, tabVisibility, tabVisibilityLoaded),
    [tabVisibility, tabVisibilityLoaded, user?.role],
  );

  const monitorVisibility = useMemo(
    () => getMonitorSectionVisibility(user?.role, tabVisibility, tabVisibilityLoaded),
    [tabVisibility, tabVisibilityLoaded, user?.role],
  );

  useEffect(() => {
    if (!role || !username) {
      setTabVisibility(null);
      setTabVisibilityLoaded(false);
      return;
    }

    setTabVisibility(null);
    if (role === "superuser") {
      setTabVisibilityLoaded(true);
      return;
    }
    setTabVisibilityLoaded(false);
    const loader = createTabVisibilityLoader({
      load: getTabVisibility,
      onLoaded: (tabs) => {
        setTabVisibility(tabs);
        setTabVisibilityLoaded(true);
      },
    });
    void loader.refresh();
    const onSettingsUpdated = (event: Event) => {
      if (!isRelevantRoleSettingsUpdate(role, (event as CustomEvent<unknown>).detail)) return;
      setTabVisibility(null);
      setTabVisibilityLoaded(false);
      void loader.refresh();
    };
    // Recover from a missed WebSocket event while the browser was offline/asleep.
    const refresh = () => { void loader.refresh(); };

    window.addEventListener("settings-updated", onSettingsUpdated);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      loader.dispose();
      window.removeEventListener("settings-updated", onSettingsUpdated);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [role, userId, username]);

  return {
    featureLockdown,
    monitorVisibility,
    tabVisibility,
    tabVisibilityLoaded,
  };
}
