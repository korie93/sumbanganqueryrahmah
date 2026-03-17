import { useEffect, useMemo, useState } from "react";
import {
  getMonitorSectionVisibility,
  isSuperuserFeatureOffMode,
} from "@/app/monitorAccess";
import type { TabVisibility, User } from "@/app/types";
import { getTabVisibility } from "@/lib/api";

type UseAppShellTabVisibilityArgs = {
  user: User | null;
};

export function useAppShellTabVisibility({ user }: UseAppShellTabVisibilityArgs) {
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
    if (!user) {
      setTabVisibility(null);
      setTabVisibilityLoaded(false);
      return;
    }

    let cancelled = false;

    const loadTabVisibility = async () => {
      if (!cancelled) {
        setTabVisibilityLoaded(false);
      }

      if (user.role === "superuser") {
        if (!cancelled) {
          setTabVisibility(null);
          setTabVisibilityLoaded(true);
        }
        return;
      }

      try {
        const response = await getTabVisibility();
        const tabs = response?.tabs && typeof response.tabs === "object" ? response.tabs : {};
        if (!cancelled) {
          setTabVisibility(tabs);
          setTabVisibilityLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setTabVisibility(null);
          setTabVisibilityLoaded(true);
        }
      }
    };

    void loadTabVisibility();
    const onSettingsUpdated = () => {
      void loadTabVisibility();
    };

    window.addEventListener("settings-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("settings-updated", onSettingsUpdated);
    };
  }, [user]);

  return {
    featureLockdown,
    monitorVisibility,
    tabVisibility,
    tabVisibilityLoaded,
  };
}
