import { useEffect, useState } from "react";
import { DEFAULT_RUNTIME_CONFIG, DEFAULT_SYSTEM_NAME } from "@/app/constants";
import type { AppRuntimeConfig, User } from "@/app/types";
import { getAppConfig } from "@/lib/api";

type UseAppShellRuntimeStateArgs = {
  user: User | null;
};

export function useAppShellRuntimeState({ user }: UseAppShellRuntimeStateArgs) {
  const [systemName, setSystemName] = useState(DEFAULT_SYSTEM_NAME);
  const [runtimeConfig, setRuntimeConfig] = useState<AppRuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

  useEffect(() => {
    if (!user) {
      setSystemName(DEFAULT_SYSTEM_NAME);
      setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
      return;
    }

    let cancelled = false;

    const loadAppRuntimeConfig = async () => {
      try {
        const response = await getAppConfig();
        const name = String(response?.systemName || "").trim();
        const sessionTimeoutMinutes = Number(response?.sessionTimeoutMinutes);
        const heartbeatIntervalMinutes = Number(response?.heartbeatIntervalMinutes);
        const aiTimeoutMs = Number(response?.aiTimeoutMs);
        const searchResultLimit = Number(response?.searchResultLimit);
        const viewerRowsPerPage = Number(response?.viewerRowsPerPage);

        if (!cancelled) {
          setSystemName(name || DEFAULT_SYSTEM_NAME);
          setRuntimeConfig({
            sessionTimeoutMinutes: Number.isFinite(sessionTimeoutMinutes)
              ? Math.max(1, sessionTimeoutMinutes)
              : DEFAULT_RUNTIME_CONFIG.sessionTimeoutMinutes,
            heartbeatIntervalMinutes: Number.isFinite(heartbeatIntervalMinutes)
              ? Math.max(1, heartbeatIntervalMinutes)
              : DEFAULT_RUNTIME_CONFIG.heartbeatIntervalMinutes,
            aiTimeoutMs: Number.isFinite(aiTimeoutMs)
              ? Math.max(1000, aiTimeoutMs)
              : DEFAULT_RUNTIME_CONFIG.aiTimeoutMs,
            aiEnabled: response?.aiEnabled !== false,
            searchResultLimit: Number.isFinite(searchResultLimit)
              ? Math.min(5000, Math.max(10, Math.floor(searchResultLimit)))
              : DEFAULT_RUNTIME_CONFIG.searchResultLimit,
            viewerRowsPerPage: Number.isFinite(viewerRowsPerPage)
              ? Math.min(500, Math.max(10, Math.floor(viewerRowsPerPage)))
              : DEFAULT_RUNTIME_CONFIG.viewerRowsPerPage,
          });
        }
      } catch {
        if (!cancelled) {
          setSystemName(DEFAULT_SYSTEM_NAME);
          setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
        }
      }
    };

    void loadAppRuntimeConfig();
    const onSettingsUpdated = () => {
      void loadAppRuntimeConfig();
    };

    window.addEventListener("settings-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("settings-updated", onSettingsUpdated);
    };
  }, [user]);

  return {
    runtimeConfig,
    systemName,
  };
}
