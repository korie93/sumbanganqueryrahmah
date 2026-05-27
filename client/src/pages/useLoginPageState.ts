import { useCallback, useEffect, useRef } from "react";

import type { User } from "@/app/types";
import { consumeStoredAuthNotice } from "@/lib/auth-session";
import { isLockedAccountFlow } from "@/pages/login-lock-state";
import { useLoginFormState } from "@/pages/useLoginFormState";
import { useLoginRedirect } from "@/pages/useLoginRedirect";
import { useLoginSecurity } from "@/pages/useLoginSecurity";
import { useLoginSubmission } from "@/pages/useLoginSubmission";

type UseLoginPageStateParams = {
  onBanned?: (() => void) | undefined;
  onForgotPasswordClick?: (() => void) | undefined;
  onLandingClick?: (() => void) | undefined;
  onLoginSuccess: (user: User) => void;
};

export function useLoginPageState({
  onBanned,
  onForgotPasswordClick,
  onLandingClick,
  onLoginSuccess,
}: UseLoginPageStateParams) {
  const form = useLoginFormState();
  const security = useLoginSecurity({ username: form.username });
  const redirect = useLoginRedirect({
    clearLockedAccountState: security.clearLockedAccountState,
    clearTwoFactorChallenge: security.clearTwoFactorChallenge,
    onForgotPasswordClick,
    onLandingClick,
    onLoginSuccess,
  });
  const storedNoticeConsumedRef = useRef(false);

  useEffect(() => {
    if (storedNoticeConsumedRef.current) {
      return;
    }
    storedNoticeConsumedRef.current = true;

    const message = consumeStoredAuthNotice();
    if (message) {
      form.setNotice(message);
    }
  }, [form]);

  const handleUsernameChange = useCallback((value: string) => {
    form.setUsername(value);
    form.setUsernameError("");
    if (!isLockedAccountFlow({
      lockedUsername: security.lockedUsername,
      currentUsername: value,
      twoFactorChallengeToken: security.twoFactorChallengeToken,
    })) {
      form.setError("");
      form.setNotice("");
    }
  }, [form, security.lockedUsername, security.twoFactorChallengeToken]);

  const setPassword = useCallback((value: string) => {
    form.setPassword(value);
    if (!security.lockedFlow) {
      form.setError("");
    }
  }, [form, security.lockedFlow]);

  const setTwoFactorCode = useCallback((value: string) => {
    security.setTwoFactorCode(value);
    if (!security.lockedFlow) {
      form.setError("");
    }
  }, [form, security]);

  const returnToPasswordLogin = useCallback(() => {
    security.clearTwoFactorChallenge();
    form.setNotice("");
    form.setError("");
    form.setUsernameError("");
    form.setPasswordError("");
    security.clearLockedAccountMessage();
  }, [form, security]);

  const submission = useLoginSubmission({
    applyLockedAccountError: security.applyLockedAccountError,
    clearLockedAccountMessage: security.clearLockedAccountMessage,
    clearLockedAccountState: security.clearLockedAccountState,
    completeAuthenticatedSession: redirect.completeAuthenticatedSession,
    lockedFlow: security.lockedFlow,
    onBanned,
    password: form.password,
    setError: form.setError,
    setNotice: form.setNotice,
    setPasswordError: form.setPasswordError,
    setTwoFactorCodeError: security.setTwoFactorCodeError,
    setUsernameError: form.setUsernameError,
    startTwoFactorChallenge: security.startTwoFactorChallenge,
    twoFactorChallengeToken: security.twoFactorChallengeToken,
    twoFactorCode: security.twoFactorCode,
    username: form.username,
  });

  return {
    username: form.username,
    password: form.password,
    error: form.error,
    notice: form.notice,
    usernameError: form.usernameError,
    passwordError: form.passwordError,
    twoFactorCodeError: security.twoFactorCodeError,
    lockedAccountMessage: security.lockedAccountMessage,
    lockedRetryUntilMs: security.lockedRetryUntilMs,
    loading: submission.loading,
    showPassword: form.showPassword,
    twoFactorChallengeToken: security.twoFactorChallengeToken,
    twoFactorCode: security.twoFactorCode,
    lockedFlow: security.lockedFlow,
    setPassword,
    setTwoFactorCode,
    handleUsernameChange,
    handleSubmit: submission.handleSubmit,
    handleInputKeyDown: submission.handleInputKeyDown,
    toggleShowPassword: form.toggleShowPassword,
    returnToPasswordLogin,
    goToLandingPage: redirect.goToLandingPage,
    goToForgotPassword: redirect.goToForgotPassword,
  };
}
