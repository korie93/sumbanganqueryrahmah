import { useCallback, useEffect, useState } from "react";

import { normalizeTwoFactorCode } from "@/pages/auth-field-utils";
import { isLockedAccountFlow, normalizeLoginIdentity } from "@/pages/login-lock-state";
import { readErrorMessage, readRetryAfterMs } from "@/pages/login-page-utils";

type UseLoginSecurityParams = {
  username: string;
};

/**
 * Owns login security state: account lockout countdown and the active
 * two-factor challenge/code entry state.
 *
 * @param params.username Current username value used to determine whether a
 * locked-account response still applies to the visible login flow.
 * @returns Security state plus helpers for lockout and 2FA transitions.
 */
export function useLoginSecurity({ username }: UseLoginSecurityParams) {
  const [twoFactorCodeError, setTwoFactorCodeError] = useState("");
  const [lockedAccountMessage, setLockedAccountMessage] = useState("");
  const [lockedRetryUntilMs, setLockedRetryUntilMs] = useState<number | null>(null);
  const [lockedUsername, setLockedUsername] = useState("");
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCodeValue] = useState("");

  const lockedFlow = isLockedAccountFlow({
    lockedUsername,
    currentUsername: username,
    twoFactorChallengeToken,
  });

  const clearLockedAccountState = useCallback(() => {
    setLockedUsername("");
    setLockedAccountMessage("");
    setLockedRetryUntilMs(null);
  }, []);

  const clearLockedAccountMessage = useCallback(() => {
    setLockedAccountMessage("");
  }, []);

  useEffect(() => {
    if (!lockedUsername || !lockedRetryUntilMs) {
      return;
    }

    const remainingMs = lockedRetryUntilMs - Date.now();
    if (remainingMs <= 0) {
      clearLockedAccountState();
      return;
    }

    const timeoutId = window.setTimeout(clearLockedAccountState, remainingMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [clearLockedAccountState, lockedRetryUntilMs, lockedUsername]);

  const setTwoFactorCode = useCallback((value: string) => {
    setTwoFactorCodeValue(normalizeTwoFactorCode(value));
    setTwoFactorCodeError("");
  }, []);

  const startTwoFactorChallenge = useCallback((challengeToken: string) => {
    clearLockedAccountState();
    setTwoFactorChallengeToken(challengeToken);
    setTwoFactorCodeValue("");
    setTwoFactorCodeError("");
  }, [clearLockedAccountState]);

  const clearTwoFactorChallenge = useCallback(() => {
    setTwoFactorChallengeToken("");
    setTwoFactorCodeValue("");
    setTwoFactorCodeError("");
  }, []);

  const applyLockedAccountError = useCallback((error: unknown, currentUsername: string, fallbackMessage: string) => {
    setTwoFactorChallengeToken("");
    setTwoFactorCodeValue("");
    setTwoFactorCodeError("");
    setLockedUsername(normalizeLoginIdentity(currentUsername));
    const retryAfterMs = readRetryAfterMs(error);
    setLockedRetryUntilMs(retryAfterMs === null ? null : Date.now() + retryAfterMs);
    setLockedAccountMessage(readErrorMessage(error, fallbackMessage));
  }, []);

  return {
    twoFactorCodeError,
    lockedAccountMessage,
    lockedRetryUntilMs,
    lockedUsername,
    twoFactorChallengeToken,
    twoFactorCode,
    lockedFlow,
    setTwoFactorCode,
    setTwoFactorCodeError,
    startTwoFactorChallenge,
    clearTwoFactorChallenge,
    clearLockedAccountState,
    clearLockedAccountMessage,
    applyLockedAccountError,
  };
}
