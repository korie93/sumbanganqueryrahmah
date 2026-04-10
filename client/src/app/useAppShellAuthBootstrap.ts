import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ACTIVE_SETTINGS_SECTION_KEY,
} from "@/app/constants";
import {
  isPublicAuthRoutePage,
  parseMonitorSectionFromPageInput,
  replaceHistory,
  resolveRouteFromLocation,
  type ResolvedRoute,
} from "@/app/routing";
import type { MonitorSection, User } from "@/app/types";
import {
  getStoredAuthenticatedUser,
  getStoredForcePasswordChange,
  hasAuthSessionHintCookie,
  isBannedSessionFlagSet,
  persistAuthenticatedUser,
} from "@/lib/auth-session";
import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { getMe } from "@/lib/api";

type UseAppShellAuthBootstrapArgs = {
  applyResolvedRoute: (route: ResolvedRoute | null) => boolean;
  clearClientSessionStorage: () => void;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  setIsInitialized: Dispatch<SetStateAction<boolean>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  user: User | null;
};

export function useAppShellAuthBootstrap({
  applyResolvedRoute,
  clearClientSessionStorage,
  setCurrentPage,
  setIsInitialized,
  setMonitorSection,
  setUser,
  user,
}: UseAppShellAuthBootstrapArgs) {
  useEffect(() => {
    let cancelled = false;
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const resolvedRoute = resolveRouteFromLocation(pathname, search);

    applyResolvedRoute(resolvedRoute);

    if (typeof window === "undefined") {
      setIsInitialized(true);
      return;
    }

    if (isBannedSessionFlagSet()) {
      setIsInitialized(true);
      return;
    }

    const savedUser = getStoredAuthenticatedUser();
    const storage = getBrowserLocalStorage();
    const savedPage = safeGetStorageItem(storage, "activeTab") || safeGetStorageItem(storage, "lastPage");
    const forcePasswordChange = getStoredForcePasswordChange();
    const hasAuthHintCookie = hasAuthSessionHintCookie();

    if (savedUser || hasAuthHintCookie) {
      if (savedUser && !hasAuthHintCookie) {
        clearClientSessionStorage();
        setIsInitialized(true);
        return () => {
          cancelled = true;
        };
      }

      const restoreAuthenticatedSession = async () => {
        try {
          const me = await getMe();
          if (cancelled) return;

          const username = String(me?.username || "").trim();
          const role = String(me?.role || "").trim();
          if (!username || !role) {
            throw new Error("Invalid session");
          }

          const nextUser: User = {
            id: me.id,
            username,
            fullName: me.fullName ?? null,
            email: me.email ?? null,
            role,
            status: me.status,
            mustChangePassword: forcePasswordChange || Boolean(me.mustChangePassword),
            passwordResetBySuperuser: Boolean(me.passwordResetBySuperuser),
            isBanned: me.isBanned ?? null,
          };

          persistAuthenticatedUser(nextUser);
          setUser(nextUser);

          if (!resolvedRoute || isPublicAuthRoutePage(resolvedRoute.page) || !applyResolvedRoute(resolvedRoute)) {
            if (nextUser.mustChangePassword) {
              setCurrentPage("change-password");
              replaceHistory("/change-password");
            } else if (savedPage === "backup") {
              safeSetStorageItem(storage, ACTIVE_SETTINGS_SECTION_KEY, "backup-restore");
              setCurrentPage("settings");
              replaceHistory("/settings?section=backup-restore");
            } else if (nextUser.role === "user") {
              setCurrentPage(savedPage === "settings" ? "settings" : "general-search");
            } else if (savedPage) {
              const savedMonitorSection = parseMonitorSectionFromPageInput(savedPage);
              if (savedMonitorSection) {
                setCurrentPage("monitor");
                setMonitorSection(savedMonitorSection);
              } else {
                setCurrentPage(savedPage);
              }
            }
          }
        } catch {
          if (!cancelled) {
            clearClientSessionStorage();
          }
        } finally {
          if (!cancelled) {
            setIsInitialized(true);
          }
        }
      };

      void restoreAuthenticatedSession();
      return () => {
        cancelled = true;
      };
    }

    setIsInitialized(true);
    return () => {
      cancelled = true;
    };
  }, [
    applyResolvedRoute,
    clearClientSessionStorage,
    setCurrentPage,
    setIsInitialized,
    setMonitorSection,
    setUser,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || user) return;
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === "/change-password" && !getStoredAuthenticatedUser() && !hasAuthSessionHintCookie()) {
      replaceHistory("/");
      setCurrentPage("home");
    }
  }, [setCurrentPage, user]);
}
