import { useCallback, useState, type MutableRefObject } from "react";
import {
  disableTwoFactor,
  enableTwoFactor,
  startTwoFactorSetup,
  updateMyCredentials,
} from "@/lib/api";
import { broadcastForcedLogout, persistAuthenticatedUser } from "@/lib/auth-session";
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
    twoFactorEnabled: Boolean(
      response?.user?.twoFactorEnabled ?? currentUser.twoFactorEnabled ?? false,
    ),
    twoFactorPendingSetup: Boolean(
      response?.user?.twoFactorPendingSetup ?? currentUser.twoFactorPendingSetup ?? false,
    ),
    twoFactorConfiguredAt:
      response?.user?.twoFactorConfiguredAt ?? currentUser.twoFactorConfiguredAt ?? null,
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
  const [twoFactorPasswordInput, setTwoFactorPasswordInput] = useState("");
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState("");
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorSetupAccountName, setTwoFactorSetupAccountName] = useState("");
  const [twoFactorSetupIssuer, setTwoFactorSetupIssuer] = useState("");
  const [twoFactorSetupUri, setTwoFactorSetupUri] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  const hydrateCurrentUser = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
    setUsernameInput(nextUser.username);
  }, []);

  const syncLocalUser = useCallback((nextUser: CurrentUser) => {
    persistAuthenticatedUser(nextUser);
    window.dispatchEvent(new CustomEvent("profile-updated", { detail: nextUser }));
  }, []);

  const forceLogoutAfterPasswordChange = useCallback(() => {
    broadcastForcedLogout("Password changed. Please login again.");
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

  const clearTwoFactorSetupState = useCallback(() => {
    setTwoFactorSetupSecret("");
    setTwoFactorSetupAccountName("");
    setTwoFactorSetupIssuer("");
    setTwoFactorSetupUri("");
    setTwoFactorCodeInput("");
  }, []);

  const handleStartTwoFactorSetup = useCallback(async () => {
    if (!currentUser || twoFactorLoading) return;
    if (currentUser.role !== "admin" && currentUser.role !== "superuser") {
      toast({
        title: "Unavailable",
        description: "Two-factor authentication is only available for admin and superuser accounts.",
        variant: "destructive",
      });
      return;
    }

    if (!twoFactorPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Current password is required to start two-factor setup.",
        variant: "destructive",
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await startTwoFactorSetup({ currentPassword: twoFactorPasswordInput });
      const nextUser = buildNextCurrentUser(currentUser, currentUser.username, response);
      if (!isMountedRef.current) return;
      setCurrentUser(nextUser);
      syncLocalUser(nextUser);
      setTwoFactorSetupSecret(String(response?.setup?.secret || ""));
      setTwoFactorSetupAccountName(String(response?.setup?.accountName || nextUser.username));
      setTwoFactorSetupIssuer(String(response?.setup?.issuer || "SQR"));
      setTwoFactorSetupUri(String(response?.setup?.otpauthUrl || ""));
      setTwoFactorCodeInput("");
      toast(buildMutationSuccessToast({
        title: "Two-Factor Setup Ready",
        description: "Add the secret key to your authenticator app, then verify the 6-digit code.",
      }));
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "2FA Setup Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [currentUser, isMountedRef, syncLocalUser, toast, twoFactorLoading, twoFactorPasswordInput]);

  const handleEnableTwoFactor = useCallback(async () => {
    if (!currentUser || twoFactorLoading) return;
    const normalizedCode = twoFactorCodeInput.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      toast({
        title: "Validation Error",
        description: "Enter the 6-digit authenticator code.",
        variant: "destructive",
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await enableTwoFactor({ code: normalizedCode });
      const nextUser = buildNextCurrentUser(currentUser, currentUser.username, response);
      if (!isMountedRef.current) return;
      setCurrentUser(nextUser);
      syncLocalUser(nextUser);
      clearTwoFactorSetupState();
      setTwoFactorPasswordInput("");
      toast(buildMutationSuccessToast({
        title: "Two-Factor Enabled",
        description: "Authenticator-based sign-in is now active for this account.",
      }));
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "2FA Enable Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [clearTwoFactorSetupState, currentUser, isMountedRef, syncLocalUser, toast, twoFactorCodeInput, twoFactorLoading]);

  const handleDisableTwoFactor = useCallback(async () => {
    if (!currentUser || twoFactorLoading) return;
    if (!twoFactorPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Current password is required to disable two-factor authentication.",
        variant: "destructive",
      });
      return;
    }

    const normalizedCode = twoFactorCodeInput.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      toast({
        title: "Validation Error",
        description: "Enter the 6-digit authenticator code.",
        variant: "destructive",
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await disableTwoFactor({
        currentPassword: twoFactorPasswordInput,
        code: normalizedCode,
      });
      const nextUser = buildNextCurrentUser(currentUser, currentUser.username, response);
      if (!isMountedRef.current) return;
      setCurrentUser(nextUser);
      syncLocalUser(nextUser);
      clearTwoFactorSetupState();
      setTwoFactorPasswordInput("");
      toast(buildMutationSuccessToast({
        title: "Two-Factor Disabled",
        description: "Authenticator-based sign-in has been turned off for this account.",
      }));
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "2FA Disable Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [clearTwoFactorSetupState, currentUser, isMountedRef, syncLocalUser, toast, twoFactorCodeInput, twoFactorLoading, twoFactorPasswordInput]);

  return {
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleChangePassword,
    handleChangeUsername,
    handleStartTwoFactorSetup,
    hydrateCurrentUser,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    setUsernameInput,
    twoFactorCodeInput,
    twoFactorLoading,
    twoFactorPasswordInput,
    twoFactorSetupAccountName,
    twoFactorSetupIssuer,
    twoFactorSetupSecret,
    twoFactorSetupUri,
    usernameInput,
    usernameSaving,
  };
}
