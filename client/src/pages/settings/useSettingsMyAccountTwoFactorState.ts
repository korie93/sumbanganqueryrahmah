import { useCallback, useState } from "react";
import {
  disableTwoFactor,
  enableTwoFactor,
  startTwoFactorSetup,
} from "@/lib/api";
import {
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  type SyncCurrentUserFn,
  type UseSettingsMyAccountArgs,
} from "@/pages/settings/settings-my-account-shared";
import {
  buildNextCurrentUser,
  canConfigureTwoFactor,
  normalizeAuthenticatorCode,
} from "@/pages/settings/settings-my-account-utils";
import type { CurrentUser } from "@/pages/settings/types";
import { buildSettingsMutationErrorToast } from "@/pages/settings/utils";

type UseSettingsMyAccountTwoFactorStateArgs = UseSettingsMyAccountArgs & {
  currentUser: CurrentUser | null;
  syncCurrentUser: SyncCurrentUserFn;
};

export function useSettingsMyAccountTwoFactorState({
  currentUser,
  isMountedRef,
  syncCurrentUser,
  toast,
}: UseSettingsMyAccountTwoFactorStateArgs) {
  const [twoFactorPasswordInput, setTwoFactorPasswordInput] = useState("");
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState("");
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorSetupAccountName, setTwoFactorSetupAccountName] = useState("");
  const [twoFactorSetupIssuer, setTwoFactorSetupIssuer] = useState("");
  const [twoFactorSetupUri, setTwoFactorSetupUri] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  const clearTwoFactorSetupState = useCallback(() => {
    setTwoFactorSetupSecret("");
    setTwoFactorSetupAccountName("");
    setTwoFactorSetupIssuer("");
    setTwoFactorSetupUri("");
    setTwoFactorCodeInput("");
  }, []);

  const handleStartTwoFactorSetup = useCallback(async () => {
    if (!currentUser || twoFactorLoading) return;
    if (!canConfigureTwoFactor(currentUser.role)) {
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
      syncCurrentUser(nextUser);
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
      toast(buildSettingsMutationErrorToast(error, "2FA Setup Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [currentUser, isMountedRef, syncCurrentUser, toast, twoFactorLoading, twoFactorPasswordInput]);

  const handleEnableTwoFactor = useCallback(async () => {
    if (!currentUser || twoFactorLoading) return;
    const normalizedCode = normalizeAuthenticatorCode(twoFactorCodeInput);
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
      syncCurrentUser(nextUser);
      clearTwoFactorSetupState();
      setTwoFactorPasswordInput("");
      toast(buildMutationSuccessToast({
        title: "Two-Factor Enabled",
        description: "Authenticator-based sign-in is now active for this account.",
      }));
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "2FA Enable Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [clearTwoFactorSetupState, currentUser, isMountedRef, syncCurrentUser, toast, twoFactorCodeInput, twoFactorLoading]);

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

    const normalizedCode = normalizeAuthenticatorCode(twoFactorCodeInput);
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
      syncCurrentUser(nextUser);
      clearTwoFactorSetupState();
      setTwoFactorPasswordInput("");
      toast(buildMutationSuccessToast({
        title: "Two-Factor Disabled",
        description: "Authenticator-based sign-in has been turned off for this account.",
      }));
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "2FA Disable Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setTwoFactorLoading(false);
    }
  }, [clearTwoFactorSetupState, currentUser, isMountedRef, syncCurrentUser, toast, twoFactorCodeInput, twoFactorLoading, twoFactorPasswordInput]);

  return {
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleStartTwoFactorSetup,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    twoFactorCodeInput,
    twoFactorLoading,
    twoFactorPasswordInput,
    twoFactorSetupAccountName,
    twoFactorSetupIssuer,
    twoFactorSetupSecret,
    twoFactorSetupUri,
  };
}
