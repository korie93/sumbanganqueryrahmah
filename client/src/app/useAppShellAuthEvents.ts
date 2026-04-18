import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { replaceHistory } from "@/app/routing";
import type { PageName, User } from "@/app/types";
import { persistAuthenticatedUser } from "@/lib/auth-session";

type ProfileUpdatedDetail = {
  username?: string;
  role?: string;
};

type UseAppShellAuthEventsArgs = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  setCurrentPage: Dispatch<SetStateAction<PageName>>;
  setUser: Dispatch<SetStateAction<User | null>>;
};

export function useAppShellAuthEvents({
  applyLoggedOutClientState,
  setCurrentPage,
  setUser,
}: UseAppShellAuthEventsArgs) {
  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail;
      if (!detail?.username || !detail?.role) return;
      const username = detail.username;
      const role = detail.role;

      setUser((previous) => {
        if (!previous) {
          const nextUser = { username, role };
          persistAuthenticatedUser(nextUser);
          return nextUser;
        }
        const nextUser = { ...previous, username, role };
        persistAuthenticatedUser(nextUser);
        return nextUser;
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
  }, [setUser]);

  useEffect(() => {
    const onForcePasswordChange = () => {
      setUser((previous) => {
        if (!previous) return previous;
        const nextUser = { ...previous, mustChangePassword: true };
        persistAuthenticatedUser(nextUser);
        return nextUser;
      });
      setCurrentPage("change-password");
      replaceHistory("/change-password");
    };

    const onForceLogout = () => {
      applyLoggedOutClientState(true);
    };

    window.addEventListener("force-password-change", onForcePasswordChange);
    window.addEventListener("force-logout", onForceLogout);
    return () => {
      window.removeEventListener("force-password-change", onForcePasswordChange);
      window.removeEventListener("force-logout", onForceLogout);
    };
  }, [applyLoggedOutClientState, setCurrentPage, setUser]);
}
