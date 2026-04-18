import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { replaceHistory } from "@/app/routing";
import type { PageName, User } from "@/app/types";
import { getMe } from "@/lib/api";
import { persistAuthenticatedUser } from "@/lib/auth-session";

type UseAppShellSessionValidationArgs = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  setCurrentPage: Dispatch<SetStateAction<PageName>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  user: User | null;
};

export function useAppShellSessionValidation({
  applyLoggedOutClientState,
  setCurrentPage,
  setUser,
  user,
}: UseAppShellSessionValidationArgs) {
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const validateSession = async () => {
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
          mustChangePassword: Boolean(me.mustChangePassword),
          passwordResetBySuperuser: Boolean(me.passwordResetBySuperuser),
          isBanned: me.isBanned ?? null,
        };

        persistAuthenticatedUser(nextUser);
        setUser(nextUser);
        if (nextUser.mustChangePassword) {
          setCurrentPage("change-password");
          replaceHistory("/change-password");
        }
      } catch {
        if (!cancelled) {
          applyLoggedOutClientState(true);
        }
      }
    };

    void validateSession();
    return () => {
      cancelled = true;
    };
  }, [applyLoggedOutClientState, setCurrentPage, setUser, user?.role, user?.username]);
}
