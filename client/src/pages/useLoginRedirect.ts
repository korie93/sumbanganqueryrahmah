import { useCallback } from "react";
import { useLocation } from "wouter";

import type { User } from "@/app/types";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import type { LoginSuccessResponse } from "@/lib/api/auth";
import {
  persistAuthenticatedUser,
  setBannedSessionFlag,
  setStoredActivityId,
  setStoredFingerprint,
} from "@/lib/auth-session";
import { buildAuthenticatedUser, resolveAuthenticatedDefaultTab } from "@/pages/login-page-utils";

type UseLoginRedirectParams = {
  clearLockedAccountState: () => void;
  clearTwoFactorChallenge: () => void;
  onForgotPasswordClick?: (() => void) | undefined;
  onLandingClick?: (() => void) | undefined;
  onLoginSuccess: (user: User) => void;
};

type CompleteAuthenticatedSessionOptions = {
  clearTwoFactor?: boolean | undefined;
  fingerprint?: string | null | undefined;
};

/**
 * Owns post-login side effects and public-page fallback navigation.
 *
 * @param params Callback dependencies from the public app shell and security
 * state cleanup hooks.
 * @returns Navigation helpers and the authenticated-session completion helper.
 */
export function useLoginRedirect({
  clearLockedAccountState,
  clearTwoFactorChallenge,
  onForgotPasswordClick,
  onLandingClick,
  onLoginSuccess,
}: UseLoginRedirectParams) {
  const [, navigate] = useLocation();

  const completeAuthenticatedSession = useCallback((
    response: LoginSuccessResponse,
    options?: CompleteAuthenticatedSessionOptions,
  ) => {
    const authenticatedUser = buildAuthenticatedUser(response);

    setBannedSessionFlag(false);
    if (options?.fingerprint) {
      setStoredFingerprint(options.fingerprint);
    }
    persistAuthenticatedUser(authenticatedUser);
    clearLockedAccountState();

    if (response.activityId) {
      setStoredActivityId(String(response.activityId));
    }

    const defaultTab = resolveAuthenticatedDefaultTab(authenticatedUser);
    const storage = getBrowserLocalStorage();
    safeSetStorageItem(storage, "activeTab", defaultTab);
    safeSetStorageItem(storage, "lastPage", defaultTab);

    if (options?.clearTwoFactor) {
      clearTwoFactorChallenge();
    }

    onLoginSuccess(authenticatedUser);
  }, [clearLockedAccountState, clearTwoFactorChallenge, onLoginSuccess]);

  const goToLandingPage = useCallback(() => {
    if (onLandingClick) {
      onLandingClick();
      return;
    }
    navigate("/");
  }, [navigate, onLandingClick]);

  const goToForgotPassword = useCallback(() => {
    if (onForgotPasswordClick) {
      onForgotPasswordClick();
      return;
    }
    navigate("/forgot-password");
  }, [navigate, onForgotPasswordClick]);

  return {
    completeAuthenticatedSession,
    goToLandingPage,
    goToForgotPassword,
  };
}
