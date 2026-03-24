import { useCallback, useState, type MutableRefObject } from "react";
import { updateMyCredentials } from "@/lib/api";
import { clearAuthenticatedUserStorage, persistAuthenticatedUser } from "@/lib/auth-session";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import type { CurrentUser } from "@/pages/settings/types";
import {
  CREDENTIAL_USERNAME_REGEX,
  isStrongPassword,
  normalizeSettingsErrorPayload,
} from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsMyAccountArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

function buildNextCurrentUser(
  currentUser: CurrentUser,
  normalizedUsername: string,
  response: {
    user: CurrentUser | null;
  },
): CurrentUser {
  return {
    id: String(response?.user?.id || currentUser.id),
    username: String(response?.user?.username || normalizedUsername),
    fullName: response?.user?.fullName ?? currentUser.fullName ?? null,
    email: response?.user?.email ?? currentUser.email ?? null,
    role: String(response?.user?.role || currentUser.role),
    status: String(response?.user?.status || currentUser.status || "active"),
    mustChangePassword: Boolean(
      response?.user?.mustChangePassword ?? currentUser.mustChangePassword,
    ),
    passwordResetBySuperuser: Boolean(
      response?.user?.passwordResetBySuperuser ?? currentUser.passwordResetBySuperuser,
    ),
    isBanned: response?.user?.isBanned ?? currentUser.isBanned ?? null,
  };
}

export function useSettingsMyAccount({
  isMountedRef,
  toast,
}: UseSettingsMyAccountArgs) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const hydrateCurrentUser = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
    setUsernameInput(nextUser.username);
  }, []);

  const syncLocalUser = useCallback((nextUser: CurrentUser) => {
    persistAuthenticatedUser(nextUser);
    window.dispatchEvent(new CustomEvent("profile-updated", { detail: nextUser }));
  }, []);

  const forceLogoutAfterPasswordChange = useCallback(() => {
    clearAuthenticatedUserStorage();
    localStorage.setItem("forceLogout", "true");
    window.dispatchEvent(new CustomEvent("force-logout"));
    window.location.href = "/";
  }, []);

  const handleChangeUsername = useCallback(async () => {
    if (!currentUser || usernameSaving) return;
    const normalized = usernameInput.trim().toLowerCase();

    if (!CREDENTIAL_USERNAME_REGEX.test(normalized)) {
      toast({
        title: "Validation Error",
        description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
        variant: "destructive",
      });
      return;
    }

    if (normalized === currentUser.username) {
      toast({ title: "No Changes", description: "Username is unchanged." });
      return;
    }

    setUsernameSaving(true);
    try {
      const response = await updateMyCredentials({ newUsername: normalized });
      const nextUser = buildNextCurrentUser(currentUser, normalized, response);

      if (!isMountedRef.current) return;
      setCurrentUser(nextUser);
      setUsernameInput(nextUser.username);
      syncLocalUser(nextUser);

      toast(buildMutationSuccessToast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
      }));
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Update Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (!isMountedRef.current) return;
      setUsernameSaving(false);
    }
  }, [currentUser, isMountedRef, syncLocalUser, toast, usernameInput, usernameSaving]);

  const handleChangePassword = useCallback(async () => {
    if (!currentUser || passwordSaving) return;

    if (!currentPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Current password is required.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(newPasswordInput)) {
      toast({
        title: "Validation Error",
        description:
          "New password must be at least 8 characters and include at least one letter and one number.",
        variant: "destructive",
      });
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Confirm password does not match.",
        variant: "destructive",
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await updateMyCredentials({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      });

      if (!isMountedRef.current) return;
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");

      toast(buildMutationSuccessToast({
        title: "Password Updated",
        description: "Password changed successfully. You will need to login again.",
      }));

      if (response?.forceLogout) {
        forceLogoutAfterPasswordChange();
      }
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Update Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (!isMountedRef.current) return;
      setPasswordSaving(false);
    }
  }, [
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    forceLogoutAfterPasswordChange,
    isMountedRef,
    newPasswordInput,
    passwordSaving,
    toast,
  ]);

  return {
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    handleChangePassword,
    handleChangeUsername,
    hydrateCurrentUser,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setUsernameInput,
    usernameInput,
    usernameSaving,
  };
}
