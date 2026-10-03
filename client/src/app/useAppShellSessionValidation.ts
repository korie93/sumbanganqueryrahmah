import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { replaceHistory } from "@/app/routing";
import type { User } from "@/app/types";
import { getMe } from "@/lib/api";
import { persistAuthenticatedUser } from "@/lib/auth-session";
import { createSessionValidationProfileGuard } from "@/app/session-validation-profile-guard";

type UseAppShellSessionValidationArgs = {
  applyLoggedOutClientState: (redirectToLogin?: boolean, broadcast?: boolean) => void;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  user: User | null;
};

export function useAppShellSessionValidation({
  applyLoggedOutClientState,
  setCurrentPage,
  setUser,
  user,
}: UseAppShellSessionValidationArgs) {
  const userSessionKey = user ? `${user.id ?? ""}:${user.username}:${user.role}:${user.sessionExpiresAt ?? ""}` : "";
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const actor = userRef.current;
    if (!userSessionKey || !actor) return;
    let cancelled = false;
    let readPending = true;
    const profileGuard = createSessionValidationProfileGuard(actor);
    const onProfileUpdated = (event: Event) => {
      const update = (event as CustomEvent<User>).detail;
      if (readPending && !cancelled && update?.id && update.username) profileGuard.recordProfileUpdate(update);
    };
    window.addEventListener("profile-updated", onProfileUpdated);

    const validateSession = async () => {
      try {
        const me = await getMe();
        if (cancelled) return;

        const username = String(me?.username || "").trim();
        const role = String(me?.role || "").trim();
        if (!username || !role) {
          throw new Error("Invalid session");
        }

        const nextUser = profileGuard.applyTo({
          id: me.id,
          username,
          fullName: me.fullName ?? null,
          email: me.email ?? null,
          createdAt: me.createdAt ?? null,
          avatarUrl: me.avatarUrl ?? null,
          twoFactorEnabled: me.twoFactorEnabled ?? false,
          twoFactorPendingSetup: me.twoFactorPendingSetup ?? false,
          twoFactorConfiguredAt: me.twoFactorConfiguredAt ?? null,
          role,
          status: me.status,
          mustChangePassword: Boolean(me.mustChangePassword),
          passwordResetBySuperuser: Boolean(me.passwordResetBySuperuser),
          isBanned: me.isBanned ?? null,
          sessionExpiresAt: me.sessionExpiresAt ?? null,
        });

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
      } finally {
        readPending = false;
        window.removeEventListener("profile-updated", onProfileUpdated);
      }
    };

    void validateSession();
    return () => {
      cancelled = true;
      readPending = false;
      window.removeEventListener("profile-updated", onProfileUpdated);
    };
  }, [applyLoggedOutClientState, setCurrentPage, setUser, userSessionKey]);
}
