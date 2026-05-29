import { useCallback, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "wouter";

import {
  login,
  verifyTwoFactorLogin,
  type LoginResponse,
  type LoginSuccessResponse,
  type LoginTwoFactorChallengeResponse,
} from "@/lib/api/auth";
import { setBannedSessionFlag, setStoredFingerprint } from "@/lib/auth-session";
import { logClientError } from "@/lib/client-logger";
import { generateFingerprint } from "@/lib/fingerprint";
import { normalizeTwoFactorCode } from "@/pages/auth-field-utils";
import {
  hasLoginFieldErrors,
  isAbortRequestError,
  isCaptchaRequiredLoginError,
  isLockedAccountError,
  normalizeLoginErrorMessage,
  readErrorMessage,
  validatePasswordLoginFields,
  validateTwoFactorCodeField,
} from "@/pages/login-page-utils";
import { useLoginRequestLifecycle } from "@/pages/useLoginRequestLifecycle";

type UseLoginSubmissionParams = {
  applyLockedAccountError: (error: unknown, currentUsername: string, fallbackMessage: string) => void;
  applyCaptchaRequiredError: (error: unknown) => void;
  captchaRequired: boolean;
  captchaResponse: string;
  clearCaptchaChallenge: () => void;
  clearLockedAccountMessage: () => void;
  clearLockedAccountState: () => void;
  completeAuthenticatedSession: (
    response: LoginSuccessResponse,
    options?: { clearTwoFactor?: boolean | undefined; fingerprint?: string | null | undefined },
  ) => void;
  lockedFlow: boolean;
  onBanned?: (() => void) | undefined;
  password: string;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  setPasswordError: (value: string) => void;
  setCaptchaResponseError: (value: string) => void;
  setTwoFactorCodeError: (value: string) => void;
  setUsernameError: (value: string) => void;
  startTwoFactorChallenge: (challengeToken: string) => void;
  twoFactorChallengeToken: string;
  twoFactorCode: string;
  username: string;
};

const LOCKED_ACCOUNT_FALLBACK_MESSAGE =
  "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah.";

/**
 * Owns password-login and 2FA submission side effects while the orchestrator
 * keeps form, security, and redirect state separate.
 *
 * @param params Current form/security values and callbacks for cross-hook
 * transitions.
 * @returns Loading state plus submit and keyboard handlers consumed by Login.
 */
export function useLoginSubmission({
  applyCaptchaRequiredError,
  applyLockedAccountError,
  captchaRequired,
  captchaResponse,
  clearCaptchaChallenge,
  clearLockedAccountMessage,
  clearLockedAccountState,
  completeAuthenticatedSession,
  lockedFlow,
  onBanned,
  password,
  setError,
  setNotice,
  setPasswordError,
  setCaptchaResponseError,
  setTwoFactorCodeError,
  setUsernameError,
  startTwoFactorChallenge,
  twoFactorChallengeToken,
  twoFactorCode,
  username,
}: UseLoginSubmissionParams) {
  const [, navigate] = useLocation();
  const {
    loading,
    beginRequest: beginLoginRequest,
    finalizeRequest,
    isRequestInFlight,
    setActiveController,
    shouldIgnoreRequest,
  } = useLoginRequestLifecycle();

  const beginRequest = useCallback(() => {
    const requestId = beginLoginRequest();
    setError("");
    setNotice("");
    setUsernameError("");
    setPasswordError("");
    setCaptchaResponseError("");
    setTwoFactorCodeError("");
    clearLockedAccountMessage();
    return requestId;
  }, [
    beginLoginRequest,
    clearLockedAccountMessage,
    setError,
    setNotice,
    setPasswordError,
    setCaptchaResponseError,
    setTwoFactorCodeError,
    setUsernameError,
  ]);

  const handleLogin = useCallback(async () => {
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
      if (captchaRequired && !captchaResponse.trim()) {
        setCaptchaResponseError("Sila masukkan jawapan pengesahan keselamatan.");
        return;
      }

      controller = new AbortController();
      setActiveController(controller);
      const fingerprint = await generateFingerprint();
      if (shouldIgnoreRequest(requestId, controller)) {
        return;
      }

      const response = await login(username, password, fingerprint, {
        captchaResponse: captchaRequired ? captchaResponse : undefined,
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
          navigate("/banned");
        }
        return;
      }

      if (isTwoFactorChallengeResponse(response)) {
        setStoredFingerprint(fingerprint);
        clearLockedAccountState();
        clearCaptchaChallenge();
        startTwoFactorChallenge(String(response.challengeToken || ""));
        setNotice("Masukkan kod pengesah 6 digit untuk melengkapkan log masuk.");
        return;
      }

      clearCaptchaChallenge();
      completeAuthenticatedSession(response, { fingerprint });
    } catch (err: unknown) {
      if (isAbortRequestError(err) || shouldIgnoreRequest(requestId)) {
        return;
      }

      logClientError("Login failed:", err);
      if (isLockedAccountError(err)) {
        applyLockedAccountError(err, username, LOCKED_ACCOUNT_FALLBACK_MESSAGE);
        setError("");
        return;
      }
      if (isCaptchaRequiredLoginError(err)) {
        applyCaptchaRequiredError(err);
        setError(readErrorMessage(err, "Sila lengkapkan pengesahan keselamatan sebelum cuba semula."));
        return;
      }

      setError(normalizeLoginErrorMessage(readErrorMessage(err, "Login failed. Please try again.")));
    } finally {
      finalizeRequest(requestId, controller);
    }
  }, [
    applyLockedAccountError,
    applyCaptchaRequiredError,
    beginRequest,
    captchaRequired,
    captchaResponse,
    clearCaptchaChallenge,
    clearLockedAccountState,
    completeAuthenticatedSession,
    finalizeRequest,
    isRequestInFlight,
    lockedFlow,
    navigate,
    onBanned,
    password,
    setActiveController,
    setCaptchaResponseError,
    setError,
    setNotice,
    setPasswordError,
    setUsernameError,
    shouldIgnoreRequest,
    startTwoFactorChallenge,
    username,
  ]);

  const handleVerifyTwoFactor = useCallback(async () => {
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
        applyLockedAccountError(err, username, LOCKED_ACCOUNT_FALLBACK_MESSAGE);
        setError("");
        return;
      }

      setError(readErrorMessage(err, "Pengesahan dua faktor gagal. Sila cuba lagi."));
    } finally {
      finalizeRequest(requestId, controller);
    }
  }, [
    applyLockedAccountError,
    beginRequest,
    completeAuthenticatedSession,
    finalizeRequest,
    isRequestInFlight,
    setActiveController,
    setError,
    setTwoFactorCodeError,
    shouldIgnoreRequest,
    twoFactorChallengeToken,
    twoFactorCode,
    username,
  ]);

  const submitCurrentFlow = useCallback(() => {
    if (lockedFlow) {
      return;
    }

    void (twoFactorChallengeToken ? handleVerifyTwoFactor() : handleLogin());
  }, [handleLogin, handleVerifyTwoFactor, lockedFlow, twoFactorChallengeToken]);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitCurrentFlow();
  }, [submitCurrentFlow]);

  const handleInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitCurrentFlow();
  }, [submitCurrentFlow]);

  return {
    loading,
    handleSubmit,
    handleInputKeyDown,
  };
}

function isTwoFactorChallengeResponse(response: LoginResponse): response is LoginTwoFactorChallengeResponse {
  return "twoFactorRequired" in response && response.twoFactorRequired === true;
}
