import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ACTIVE_SETTINGS_SECTION_KEY,
} from "@/app/constants";
import {
  parseMonitorSectionFromPageInput,
  replaceHistory,
  resolveRouteFromLocation,
  type ResolvedRoute,
} from "@/app/routing";
import type { MonitorSection, User } from "@/app/types";
import {
  hasAuthSessionHintCookie,
  persistAuthenticatedUser,
} from "@/lib/auth-session";
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

    const banned = localStorage.getItem("banned");
    if (banned === "1") {
      setIsInitialized(true);
      return;
    }

    const savedUser = localStorage.getItem("user");
    const savedPage = localStorage.getItem("activeTab") || localStorage.getItem("lastPage");
    const forcePasswordChange = localStorage.getItem("forcePasswordChange") === "1";

    if (savedUser) {
      if (!hasAuthSessionHintCookie()) {
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

          if (!applyResolvedRoute(resolvedRoute)) {
            if (nextUser.mustChangePassword) {
              setCurrentPage("change-password");
              replaceHistory("/change-password");
            } else if (savedPage === "backup") {
              localStorage.setItem(ACTIVE_SETTINGS_SECTION_KEY, "backup-restore");
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

      try {
        const parsedUser = JSON.parse(savedUser) as User;
        if (!parsedUser?.username || !parsedUser?.role) {
          throw new Error("Invalid cached user");
        }
        void restoreAuthenticatedSession();
      } catch {
        clearClientSessionStorage();
        setIsInitialized(true);
      }
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
    if (pathname === "/change-password" && !localStorage.getItem("user")) {
      replaceHistory("/");
      setCurrentPage("home");
    }
  }, [setCurrentPage, user]);
}
