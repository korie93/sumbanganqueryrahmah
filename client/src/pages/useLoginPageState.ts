import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { User } from "@/app/types";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import {
  login,
  verifyTwoFactorLogin,
  type LoginResponse,
  type LoginSuccessResponse,
  type LoginTwoFactorChallengeResponse,
} from "@/lib/api/auth";
import {
  consumeStoredAuthNotice,
  persistAuthenticatedUser,
  setBannedSessionFlag,
  setStoredActivityId,
  setStoredFingerprint,
} from "@/lib/auth-session";
import { generateFingerprint } from "@/lib/fingerprint";
import { logClientError } from "@/lib/client-logger";
import { normalizeTwoFactorCode } from "@/pages/auth-field-utils";
import { isLockedAccountFlow, normalizeLoginIdentity } from "@/pages/login-lock-state";
import {
  buildAuthenticatedUser,
  hasLoginFieldErrors,
  isAbortRequestError,
  isLockedAccountError,
  normalizeLoginErrorMessage,
  readRetryAfterMs,
  readErrorMessage,
  resolveAuthenticatedDefaultTab,
  validatePasswordLoginFields,
  validateTwoFactorCodeField,
} from "@/pages/login-page-utils";
import { useLoginRequestLifecycle } from "@/pages/useLoginRequestLifecycle";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [twoFactorCodeError, setTwoFactorCodeError] = useState("");
  const [lockedAccountMessage, setLockedAccountMessage] = useState("");
  const [lockedRetryUntilMs, setLockedRetryUntilMs] = useState<number | null>(null);
  const [lockedUsername, setLockedUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const storedNoticeConsumedRef = useRef(false);
  const {
    loading,
    beginRequest: beginLoginRequest,
    finalizeRequest,
    isRequestInFlight,
    setActiveController,
    shouldIgnoreRequest,
  } = useLoginRequestLifecycle();
  const lockedFlow = isLockedAccountFlow({
    lockedUsername,
    currentUsername: username,
    twoFactorChallengeToken,
  });

  useEffect(() => {
    if (storedNoticeConsumedRef.current) {
      return;
    }
    storedNoticeConsumedRef.current = true;

    const message = consumeStoredAuthNotice();
    if (message) {
      setNotice(message);
    }
  }, []);

  const clearLockedAccountState = useCallback(() => {
    setLockedUsername("");
    setLockedAccountMessage("");
    setLockedRetryUntilMs(null);
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

  const beginRequest = () => {
    const requestId = beginLoginRequest();
    setError("");
    setNotice("");
    setUsernameError("");
    setPasswordError("");
    setTwoFactorCodeError("");
    setLockedAccountMessage("");
    return requestId;
  };

  const completeAuthenticatedSession = (
    response: LoginSuccessResponse,
    options?: { fingerprint?: string | null; clearTwoFactor?: boolean },
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
      setTwoFactorChallengeToken("");
      setTwoFactorCode("");
    }

    onLoginSuccess(authenticatedUser);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameError("");
    if (!isLockedAccountFlow({
      lockedUsername,
      currentUsername: value,
      twoFactorChallengeToken,
    })) {
      setError("");
      setNotice("");
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordError("");
    if (!lockedFlow) {
      setError("");
    }
  };

  const handleTwoFactorCodeChange = (value: string) => {
    setTwoFactorCode(normalizeTwoFactorCode(value));
    setTwoFactorCodeError("");
    if (!lockedFlow) {
      setError("");
    }
  };

  const handleLogin = async () => {
    if (isRequestInFlight() || lockedFlow) {
      return;
    }

    const requestId = beginRequest();
    let controller: AbortController | null = null;

    try {
      const fieldErrors = validatePasswordLoginFields(username, password);
      if (hasLoginFieldErrors(fieldErrors)) {
        if (!shouldIgnoreRequest(requestId)) {
          setUsernameError(fieldErrors.username ?? "");
          setPasswordError(fieldErrors.password ?? "");
        }
        return;
      }

      controller = new AbortController();
      setActiveController(controller);
      const fingerprint = await generateFingerprint();
      if (shouldIgnoreRequest(requestId, controller)) {
        return;
      }

      const response = await login(username, password, fingerprint, {
        signal: controller.signal,
      });
      if (shouldIgnoreRequest(requestId, controller)) {
        return;
      }

      if ("banned" in response) {
        setBannedSessionFlag(true);
        if (onBanned) {
          onBanned();
        } else {
          navigateInternalFallback("/banned");
        }
        return;
      }

      if (isTwoFactorChallengeResponse(response)) {
        setStoredFingerprint(fingerprint);
        clearLockedAccountState();
        setTwoFactorChallengeToken(String(response.challengeToken || ""));
        setTwoFactorCode("");
        setNotice("Masukkan kod pengesah 6 digit untuk melengkapkan log masuk.");
        return;
      }

      completeAuthenticatedSession(response, { fingerprint });
    } catch (err: unknown) {
      if (isAbortRequestError(err) || shouldIgnoreRequest(requestId)) {
        return;
      }

      logClientError("Login failed:", err);
      if (isLockedAccountError(err)) {
        setLockedUsername(normalizeLoginIdentity(username));
        const retryAfterMs = readRetryAfterMs(err);
        setLockedRetryUntilMs(retryAfterMs === null ? null : Date.now() + retryAfterMs);
        setLockedAccountMessage(readErrorMessage(err, "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."));
        setError("");
        return;
      }

      setError(normalizeLoginErrorMessage(readErrorMessage(err, "Login failed. Please try again.")));
    } finally {
      finalizeRequest(requestId, controller);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (isRequestInFlight()) {
      return;
    }

    const requestId = beginRequest();
    let controller: AbortController | null = null;

    try {
      if (!twoFactorChallengeToken.trim()) {
        throw new Error("Sesi pengesahan dua faktor tiada. Sila log masuk semula.");
      }

      const fieldErrors = validateTwoFactorCodeField(twoFactorCode);
      if (hasLoginFieldErrors(fieldErrors)) {
        setTwoFactorCodeError(fieldErrors.twoFactorCode ?? "");
        return;
      }
      const normalizedCode = normalizeTwoFactorCode(twoFactorCode);

      controller = new AbortController();
      setActiveController(controller);
      const response = await verifyTwoFactorLogin(
        {
          challengeToken: twoFactorChallengeToken,
          code: normalizedCode,
        },
        { signal: controller.signal },
      );
      if (shouldIgnoreRequest(requestId, controller)) {
        return;
      }

      completeAuthenticatedSession(response, { clearTwoFactor: true });
    } catch (err: unknown) {
      if (isAbortRequestError(err) || shouldIgnoreRequest(requestId)) {
        return;
      }

      logClientError("Two-factor verification failed:", err);
      if (isLockedAccountError(err)) {
        setTwoFactorChallengeToken("");
        setTwoFactorCode("");
        setLockedUsername(normalizeLoginIdentity(username));
        const retryAfterMs = readRetryAfterMs(err);
        setLockedRetryUntilMs(retryAfterMs === null ? null : Date.now() + retryAfterMs);
        setLockedAccountMessage(readErrorMessage(err, "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."));
        setError("");
        return;
      }

      setError(readErrorMessage(err, "Pengesahan dua faktor gagal. Sila cuba lagi."));
    } finally {
      finalizeRequest(requestId, controller);
    }
  };

  const submitCurrentFlow = () => {
    if (lockedFlow) {
      return;
    }

    void (twoFactorChallengeToken ? handleVerifyTwoFactor() : handleLogin());
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitCurrentFlow();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitCurrentFlow();
  };

  const returnToPasswordLogin = () => {
    setTwoFactorChallengeToken("");
    setTwoFactorCode("");
    setTwoFactorCodeError("");
    setNotice("");
    setError("");
    setUsernameError("");
    setPasswordError("");
    setLockedAccountMessage("");
  };

  return {
    username,
    password,
    error,
    notice,
    usernameError,
    passwordError,
    twoFactorCodeError,
    lockedAccountMessage,
    lockedRetryUntilMs,
    loading,
    showPassword,
    twoFactorChallengeToken,
    twoFactorCode,
    lockedFlow,
    setPassword: handlePasswordChange,
    setTwoFactorCode: handleTwoFactorCodeChange,
    handleUsernameChange,
    handleSubmit,
    handleInputKeyDown,
    toggleShowPassword: () => setShowPassword((current) => !current),
    returnToPasswordLogin,
    goToLandingPage: () => {
      if (onLandingClick) {
        onLandingClick();
        return;
      }
      navigateInternalFallback("/");
    },
    goToForgotPassword: () => {
      if (onForgotPasswordClick) {
        onForgotPasswordClick();
        return;
      }
      navigateInternalFallback("/forgot-password");
    },
  };
}

function navigateInternalFallback(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

function isTwoFactorChallengeResponse(response: LoginResponse): response is LoginTwoFactorChallengeResponse {
  return "twoFactorRequired" in response && response.twoFactorRequired === true;
}
