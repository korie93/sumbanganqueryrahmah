import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAppShellAuthActions } from "@/app/useAppShellAuthActions";
import { useAppShellAuthLifecycle } from "@/app/useAppShellAuthLifecycle";
import { useAppShellSessionValidation } from "@/app/useAppShellSessionValidation";
import type { MonitorSection, User } from "@/app/types";

type UseAppShellAuthStateArgs = {
  setCurrentPage: Dispatch<SetStateAction<string>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  setSavedCount: Dispatch<SetStateAction<number>>;
  setSelectedImportId: Dispatch<SetStateAction<string | undefined>>;
};

export function useAppShellAuthState({
  setCurrentPage,
  setMonitorSection,
  setSavedCount,
  setSelectedImportId,
}: UseAppShellAuthStateArgs) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const {
    applyLoggedOutClientState,
    applyResolvedRoute,
    broadcastLogoutToOtherTabs,
    clearClientSessionStorage,
    handleLoginSuccess,
  } = useAppShellAuthActions({
    setCurrentPage,
    setMonitorSection,
    setSavedCount,
    setSelectedImportId,
    setUser,
  });

  useAppShellAuthLifecycle({
    applyLoggedOutClientState,
    applyResolvedRoute,
    clearClientSessionStorage,
    setCurrentPage,
    setIsInitialized,
    setMonitorSection,
    setUser,
    user,
  });

  useAppShellSessionValidation({
    applyLoggedOutClientState,
    setCurrentPage,
    setUser,
    user,
  });

  return {
    applyLoggedOutClientState,
    broadcastLogoutToOtherTabs,
    handleLoginSuccess,
    isInitialized,
    user,
  };
}
