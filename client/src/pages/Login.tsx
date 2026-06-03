import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { User } from "@/app/types";
import { ExpandableMessage } from "@/components/ExpandableMessage";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { shouldAutoFocusPublicAuthField } from "@/lib/interaction-media";
import {
  LoginAsidePanel,
  LoginBrandHeader,
  LoginFooter,
  LoginLockedAlert,
  LoginPasswordVisibilityButton,
  LoginSecondaryActions,
  LoginSubmitContent,
} from "@/pages/LoginParts";
import { useLoginPageState } from "@/pages/useLoginPageState";
import "./Login.css";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onBanned?: () => void;
  onForgotPasswordClick?: () => void;
  onLandingClick?: () => void;
}

export default function Login({ onBanned, onForgotPasswordClick, onLandingClick, onLoginSuccess }: LoginProps) {
  const [, navigate] = useLocation();
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const twoFactorCodeInputRef = useRef<HTMLInputElement | null>(null);
  const captchaResponseInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedValidationKeyRef = useRef("");
  const {
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
    captchaRequired,
    captchaChallenge,
    captchaResponse,
    captchaResponseError,
    lockedFlow,
    lockedRetryUntilMs,
    setPassword,
    setTwoFactorCode,
    setCaptchaResponse,
    handleUsernameChange,
    handleUsernameBlur,
    handlePasswordBlur,
    handleTwoFactorCodeBlur,
    handleCaptchaResponseBlur,
    handleSubmit,
    handleInputKeyDown,
    toggleShowPassword,
    returnToPasswordLogin,
    goToLandingPage,
    goToForgotPassword,
  } = useLoginPageState({
    onBanned: onBanned ?? (() => navigate("/banned")),
    onForgotPasswordClick: onForgotPasswordClick ?? (() => navigate("/forgot-password")),
    onLandingClick: onLandingClick ?? (() => navigate("/")),
    onLoginSuccess,
  });

  const loginFormBusyProps = loading
    ? { "aria-atomic": "true" as const, "aria-busy": "true" as const, "aria-live": "polite" as const }
    : {};
  const usernameInvalidProps = usernameError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "login-username-error",
    }
    : {};
  const passwordInvalidProps = passwordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "login-password-error",
    }
    : {};
  const twoFactorInvalidProps = twoFactorCodeError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "login-two-factor-help login-two-factor-error",
    }
    : {
      "aria-describedby": "login-two-factor-help",
    };
  const captchaInvalidProps = captchaResponseError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "login-captcha-help login-captcha-error",
    }
    : {
      "aria-describedby": "login-captcha-help",
    };
  const [lockedCountdownMs, setLockedCountdownMs] = useState(0);
  const mountedRef = useRef(true);
  const lockedCountdownIntervalRef = useRef<number | null>(null);

  const clearLockedCountdownInterval = useCallback(() => {
    if (typeof window !== "undefined" && lockedCountdownIntervalRef.current !== null) {
      window.clearInterval(lockedCountdownIntervalRef.current);
      lockedCountdownIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearLockedCountdownInterval();
    };
  }, [clearLockedCountdownInterval]);

  useEffect(() => {
    if (typeof window === "undefined" || !usernameInputRef.current) {
      return;
    }

    if (!shouldAutoFocusPublicAuthField()) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      usernameInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    const validationKey = [
      usernameError,
      passwordError,
      twoFactorCodeError,
      captchaResponseError,
    ].filter(Boolean).join("|");

    if (!validationKey) {
      lastFocusedValidationKeyRef.current = "";
      return;
    }

    if (lastFocusedValidationKeyRef.current === validationKey) {
      return;
    }

    const target =
      usernameError ? usernameInputRef.current :
        passwordError ? passwordInputRef.current :
          twoFactorCodeError ? twoFactorCodeInputRef.current :
            captchaResponseError ? captchaResponseInputRef.current :
              null;

    if (!target) {
      return;
    }

    lastFocusedValidationKeyRef.current = validationKey;
    target.focus({ preventScroll: true });
  }, [captchaResponseError, loading, passwordError, twoFactorCodeError, usernameError]);

  useEffect(() => {
    if (!lockedFlow || !lockedRetryUntilMs) {
      clearLockedCountdownInterval();
      if (mountedRef.current) {
        setLockedCountdownMs(0);
      }
      return;
    }

    clearLockedCountdownInterval();
    const refreshCountdown = () => {
      if (!mountedRef.current) {
        return;
      }
      setLockedCountdownMs(Math.max(0, lockedRetryUntilMs - Date.now()));
    };
    refreshCountdown();
    lockedCountdownIntervalRef.current = window.setInterval(refreshCountdown, 1000);

    return () => {
      clearLockedCountdownInterval();
    };
  }, [clearLockedCountdownInterval, lockedFlow, lockedRetryUntilMs]);

  const lockedCountdownSeconds = Math.ceil(lockedCountdownMs / 1000);

  return (
    <div className="login-page relative w-full viewport-min-height overflow-hidden">
      <div className="login-bg-effect login-bg-pattern absolute inset-0 opacity-30" />

      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-[var(--z-public-auth-main)] flex viewport-min-height items-center justify-center px-4 py-6 login-content login-content--shell sm:py-8"
      >
        <div className="login-shell relative w-full">
          <button
            type="button"
            onClick={goToLandingPage}
            className="login-back-button mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors"
          >
            Kembali ke halaman utama
          </button>

          <div className="login-bg-effect login-halo pointer-events-none absolute -inset-4 hidden rounded-[2rem] blur-2xl sm:block" />

          <div className="login-card login-card-grid">
            <LoginAsidePanel />

            <div className="login-card-form">
              <LoginBrandHeader />

              <form className="login-form space-y-4" onSubmit={handleSubmit} noValidate {...loginFormBusyProps}>
                <div className="space-y-2">
                  <label htmlFor="login-username" className="login-field-label block text-left text-sm font-medium">
                    Username
                  </label>
                  <PublicAuthInput
                    ref={usernameInputRef}
                    id="login-username"
                    name="username"
                    className="login-input w-full rounded-xl px-4 py-3 transition-all"
                    placeholder="Masukkan username"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    onBlur={handleUsernameBlur}
                    onKeyDown={handleInputKeyDown}
                    autoComplete="username"
                    data-testid="input-username"
                    disabled={loading || Boolean(twoFactorChallengeToken)}
                    {...usernameInvalidProps}
                  />
                  {usernameError ? (
                    <p id="login-username-error" className="login-field-error text-sm" role="alert">
                      {usernameError}
                    </p>
                  ) : null}
                </div>

                {twoFactorChallengeToken ? (
                  <div className="space-y-2">
                    <label htmlFor="login-two-factor-code" className="login-field-label block text-left text-sm font-medium">
                      Kod pengesahan dua faktor
                    </label>
                    <PublicAuthInput
                      ref={twoFactorCodeInputRef}
                      id="login-two-factor-code"
                      name="twoFactorCode"
                      className="login-input login-input--otp w-full rounded-xl px-4 py-3 text-center transition-all"
                      placeholder="000000"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onBlur={handleTwoFactorCodeBlur}
                      onKeyDown={handleInputKeyDown}
                      autoComplete="one-time-code"
                      data-testid="input-two-factor-code"
                      disabled={loading}
                      {...twoFactorInvalidProps}
                    />
                    <p id="login-two-factor-help" className="login-subtitle text-center text-xs">
                      Masukkan kod 6 digit daripada aplikasi pengesah anda.
                    </p>
                    {twoFactorCodeError ? (
                      <p id="login-two-factor-error" className="login-field-error text-center text-sm" role="alert">
                        {twoFactorCodeError}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="login-password" className="login-field-label block text-left text-sm font-medium">
                      Kata laluan
                    </label>
                    <div className="relative">
                      <PublicAuthInput
                        ref={passwordInputRef}
                        id="login-password"
                        name="password"
                        className="login-input w-full rounded-xl px-4 py-3 pr-12 transition-all"
                        placeholder="Masukkan kata laluan"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={handlePasswordBlur}
                        onKeyDown={handleInputKeyDown}
                        autoComplete="current-password"
                        data-testid="input-password"
                        disabled={loading}
                        {...passwordInvalidProps}
                      />
                      <LoginPasswordVisibilityButton
                        loading={loading}
                        showPassword={showPassword}
                        onToggle={toggleShowPassword}
                      />
                    </div>
                    {passwordError ? (
                      <p id="login-password-error" className="login-field-error text-sm" role="alert">
                        {passwordError}
                      </p>
                    ) : null}
                    {captchaRequired ? (
                      <div className="mt-4 space-y-2">
                        <label htmlFor="login-captcha-response" className="login-field-label block text-left text-sm font-medium">
                          Pengesahan keselamatan
                        </label>
                        <PublicAuthInput
                          ref={captchaResponseInputRef}
                          id="login-captcha-response"
                          name="captchaResponse"
                          className="login-input w-full rounded-xl px-4 py-3 transition-all"
                          placeholder="Masukkan jawapan"
                          value={captchaResponse}
                          onChange={(e) => setCaptchaResponse(e.target.value)}
                          onBlur={handleCaptchaResponseBlur}
                          onKeyDown={handleInputKeyDown}
                          autoComplete="off"
                          data-testid="input-captcha-response"
                          disabled={loading}
                          {...captchaInvalidProps}
                        />
                        <p id="login-captcha-help" className="login-subtitle text-xs">
                          {captchaChallenge || "Server memerlukan pengesahan tambahan sebelum percubaan log masuk seterusnya."}
                        </p>
                        {captchaResponseError ? (
                          <p id="login-captcha-error" className="login-field-error text-sm" role="alert">
                            {captchaResponseError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}

                <PublicAuthButton
                  type="submit"
                  className="login-submit mt-6 h-12 w-full rounded-xl font-semibold transition-all"
                  disabled={loading || lockedFlow}
                  data-testid="button-login"
                >
                  <LoginSubmitContent
                    lockedFlow={lockedFlow}
                    loading={loading}
                    twoFactorChallengeToken={twoFactorChallengeToken}
                  />
                </PublicAuthButton>
              </form>

              {lockedFlow ? (
                <LoginLockedAlert
                  lockedAccountMessage={lockedAccountMessage}
                  lockedCountdownSeconds={lockedCountdownSeconds}
                />
              ) : null}

              <LoginSecondaryActions
                twoFactorChallengeToken={twoFactorChallengeToken}
                onForgotPassword={goToForgotPassword}
                onReturnToPasswordLogin={returnToPasswordLogin}
              />

              {error && !lockedFlow && (
                <div className="login-alert login-alert--error mt-4 text-sm" role="alert">
                  <ExpandableMessage>{error}</ExpandableMessage>
                </div>
              )}

              {notice && (
                <div className="login-alert login-alert--success mt-4 text-sm" role="status" aria-live="polite">
                  {notice}
                </div>
              )}

              <LoginFooter />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
