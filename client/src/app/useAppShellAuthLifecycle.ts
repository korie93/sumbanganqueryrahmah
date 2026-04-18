import {
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ResolvedRoute } from "@/app/routing";
import { useAppShellAuthBootstrap } from "@/app/useAppShellAuthBootstrap";
import { useAppShellAuthEvents } from "@/app/useAppShellAuthEvents";
import type { MonitorSection, PageName, User } from "@/app/types";

type UseAppShellAuthLifecycleArgs = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  applyResolvedRoute: (route: ResolvedRoute | null) => boolean;
  clearClientSessionStorage: () => void;
  setCurrentPage: Dispatch<SetStateAction<PageName>>;
  setIsInitialized: Dispatch<SetStateAction<boolean>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  user: User | null;
};

export function useAppShellAuthLifecycle({
  applyLoggedOutClientState,
  applyResolvedRoute,
  clearClientSessionStorage,
  setCurrentPage,
  setIsInitialized,
  setMonitorSection,
  setUser,
  user,
}: UseAppShellAuthLifecycleArgs) {
  useAppShellAuthBootstrap({
    applyResolvedRoute,
    clearClientSessionStorage,
    setCurrentPage,
    setIsInitialized,
    setMonitorSection,
    setUser,
    user,
  });

  useAppShellAuthEvents({
    applyLoggedOutClientState,
    setCurrentPage,
    setUser,
  });
}
