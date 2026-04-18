import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
  isRetryableLoginError,
  normalizeLoginErrorMessage,
  readErrorMessage,
  resolveAuthenticatedDefaultTab,
  validatePasswordLoginFields,
  validateTwoFactorCodeField,
} from "@/pages/login-page-utils";

type UseLoginPageStateParams = {
  onLoginSuccess: (user: User) => void;
};

type RetryableSubmissionKind = "login" | "two-factor";

const TWO_FACTOR_PROMPT_NOTICE = "Masukkan kod pengesah 6 digit untuk melengkapkan log masuk.";

export function useLoginPageState({ onLoginSuccess }: UseLoginPageStateParams) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [twoFactorCodeError, setTwoFactorCodeError] = useState("");
  const [lockedAccountMessage, setLockedAccountMessage] = useState("");
  const [lockedUsername, setLockedUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [retryableSubmissionKind, setRetryableSubmissionKind] = useState<RetryableSubmissionKind | null>(null);
  const mountedRef = useRef(true);
  const storedNoticeConsumedRef = useRef(false);
  const loginInFlightRef = useRef(false);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const loginRequestIdRef = useRef(0);
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

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      loginAbortControllerRef.current?.abort();
      loginAbortControllerRef.current = null;
      loginInFlightRef.current = false;
    };
  }, []);

  const shouldIgnoreRequest = (requestId: number, controller?: AbortController | null) =>
    !mountedRef.current
    || loginRequestIdRef.current !== requestId
    || Boolean(controller?.signal.aborted);

  const finalizeRequest = (requestId: number, controller: AbortController | null) => {
    if (loginAbortControllerRef.current === controller) {
      loginAbortControllerRef.current = null;
    }
    if (loginRequestIdRef.current === requestId) {
      loginInFlightRef.current = false;
    }
    if (mountedRef.current && loginRequestIdRef.current === requestId) {
      setLoading(false);
    }
  };

  const clearLockedAccountState = () => {
    setLockedUsername("");
    setLockedAccountMessage("");
  };

  const clearValidationErrors = () => {
    setUsernameError("");
    setPasswordError("");
    setTwoFactorCodeError("");
  };

  const clearRetryableSubmission = () => {
    setRetryableSubmissionKind(null);
  };

  const clearTwoFactorChallenge = (options?: { clearNotice?: boolean }) => {
    setTwoFactorChallengeToken("");
    setTwoFactorCode("");
    setTwoFactorCodeError("");
    clearRetryableSubmission();
    if (options?.clearNotice || notice === TWO_FACTOR_PROMPT_NOTICE) {
      setNotice("");
    }
  };

  const beginRequest = () => {
    loginInFlightRef.current = true;
    const requestId = loginRequestIdRef.current + 1;
    loginRequestIdRef.current = requestId;
    setError("");
    setNotice("");
    clearValidationErrors();
    clearRetryableSubmission();
    setLockedAccountMessage("");
    setLoading(true);
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
      clearTwoFactorChallenge({ clearNotice: true });
    } else {
      clearRetryableSubmission();
    }

    onLoginSuccess(authenticatedUser);
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameError("");
    clearRetryableSubmission();
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
    clearRetryableSubmission();
    if (!lockedFlow) {
      setError("");
    }
  };

  const handleTwoFactorCodeChange = (value: string) => {
    setTwoFactorCode(normalizeTwoFactorCode(value));
    setTwoFactorCodeError("");
    clearRetryableSubmission();
    if (!lockedFlow) {
      setError("");
    }
  };

  const handleLogin = async () => {
    if (loginInFlightRef.current || lockedFlow) {
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
      loginAbortControllerRef.current = controller;
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
        window.location.href = "/banned";
        return;
      }

      if (isTwoFactorChallengeResponse(response)) {
        setStoredFingerprint(fingerprint);
        clearLockedAccountState();
        setTwoFactorChallengeToken(String(response.challengeToken || ""));
        setTwoFactorCode("");
        setNotice(TWO_FACTOR_PROMPT_NOTICE);
        clearRetryableSubmission();
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
        setLockedAccountMessage(readErrorMessage(err, "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."));
        setError("");
        clearRetryableSubmission();
        return;
      }

      setError(normalizeLoginErrorMessage(readErrorMessage(err, "Login failed. Please try again.")));
      setRetryableSubmissionKind(isRetryableLoginError(err) ? "login" : null);
    } finally {
      finalizeRequest(requestId, controller);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (loginInFlightRef.current) {
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
      loginAbortControllerRef.current = controller;
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
        clearTwoFactorChallenge({ clearNotice: true });
        setLockedUsername(normalizeLoginIdentity(username));
        setLockedAccountMessage(readErrorMessage(err, "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."));
        setError("");
        return;
      }

      setError(readErrorMessage(err, "Pengesahan dua faktor gagal. Sila cuba lagi."));
      setRetryableSubmissionKind(isRetryableLoginError(err) ? "two-factor" : null);
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
    clearTwoFactorChallenge({ clearNotice: true });
    setError("");
    clearValidationErrors();
    setLockedAccountMessage("");
    clearRetryableSubmission();
  };

  const retrySubmission = () => {
    if (loading || lockedFlow || retryableSubmissionKind === null) {
      return;
    }

    void (retryableSubmissionKind === "two-factor" ? handleVerifyTwoFactor() : handleLogin());
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
    loading,
    showPassword,
    twoFactorChallengeToken,
    twoFactorCode,
    lockedFlow,
    canRetrySubmission: Boolean(error && retryableSubmissionKind && !loading && !lockedFlow),
    setPassword: handlePasswordChange,
    setTwoFactorCode: handleTwoFactorCodeChange,
    handleUsernameChange,
    handleSubmit,
    handleInputKeyDown,
    retrySubmission,
    toggleShowPassword: () => setShowPassword((current) => !current),
    returnToPasswordLogin,
    goToLandingPage: () => {
      window.location.href = "/";
    },
    goToForgotPassword: () => {
      window.location.href = "/forgot-password";
    },
  };
}

function isTwoFactorChallengeResponse(response: LoginResponse): response is LoginTwoFactorChallengeResponse {
  return "twoFactorRequired" in response && response.twoFactorRequired === true;
}
