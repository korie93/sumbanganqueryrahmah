import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { replaceHistory } from "@/app/routing";
import type { User } from "@/app/types";
import { persistAuthenticatedUser } from "@/lib/auth-session";
import { mergeAccountProfile } from "@/lib/account-profile";

type ProfileUpdatedDetail = User;

type UseAppShellAuthEventsArgs = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  setCurrentPage: Dispatch<SetStateAction<string>>;
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
      setUser((previous) => {
        // A late response from an old account must never recreate a logged-out
        // session or overwrite the next account's state.
        const nextUser = mergeAccountProfile(previous, detail);
        if (!nextUser || nextUser === previous) return previous;
        persistAuthenticatedUser(nextUser);
        return nextUser;
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated);
    return () => window.removeEventListener("profile-updated", onProfileUpdated);
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
