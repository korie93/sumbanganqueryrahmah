import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { User } from "@/app/types";
import { ExpandableMessage } from "@/components/ExpandableMessage";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { shouldAutoFocusPublicAuthField } from "@/lib/interaction-media";
import { Eye, EyeOff, UserRound, LockKeyhole, KeyRound, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { AuthV17Layout } from "@/components/auth/AuthV17Layout";
import { AuthOtpInput } from "@/components/auth/AuthOtpInput";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { localizeAuthFeedback } from "@/lib/auth-flow-feedback";
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
  const { locale, t } = useAuthLocale();
  const [capsLock, setCapsLock] = useState(false);
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
    if (!twoFactorChallengeToken) return;
    // This follows the user's explicit login action (also on touch devices).
    const frameId = window.requestAnimationFrame(() => {
      twoFactorCodeInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [twoFactorChallengeToken]);

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

  const isTwoFactor = Boolean(twoFactorChallengeToken);
  return (
    <AuthV17Layout
      title={t(isTwoFactor ? "auth.v17.mfaTitle" : "auth.v17.welcome")}
      description={t(isTwoFactor ? "auth.v17.mfaSubtitle" : "auth.v17.subtitle")}
      icon={isTwoFactor ? <KeyRound aria-hidden="true" /> : undefined}
      onBackClick={goToLandingPage}
      controlledAccess={!isTwoFactor}
      className="auth-v17-login"
      contentBusy={loading}
    >
      {error && !lockedFlow ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          <ExpandableMessage locale={locale}>{localizeAuthFeedback(error, locale)}</ExpandableMessage>
        </div>
      ) : null}
      {notice && !isTwoFactor ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">{localizeAuthFeedback(notice, locale)}</div>
      ) : null}
      <form className="login-form" onSubmit={handleSubmit} noValidate {...loginFormBusyProps}>
        {!isTwoFactor ? <>
          <div className="login-field">
            <label htmlFor="login-username" className="public-auth-field-label">{t("auth.v17.user")}</label>
            <div className="login-control">
              <UserRound size={18} className="login-field-icon" aria-hidden="true" />
              <PublicAuthInput ref={usernameInputRef} id="login-username" name="username" className="login-input"
                placeholder={t("auth.v17.userPlaceholder")} value={username} onChange={(e) => handleUsernameChange(e.target.value)}
                onBlur={handleUsernameBlur} onKeyDown={handleInputKeyDown} autoComplete="username" autoCapitalize="none"
                autoCorrect="off" spellCheck={false} data-testid="input-username" disabled={loading} {...usernameInvalidProps} />
            </div>
            {usernameError ? <p id="login-username-error" className="public-auth-field-error" role="alert">{t("auth.v17.userRequired")}</p> : null}
          </div>
          <div className="login-field">
            <label htmlFor="login-password" className="public-auth-field-label">{t("auth.v17.password")}</label>
            <div className="login-control">
              <LockKeyhole size={18} className="login-field-icon" aria-hidden="true" />
              <PublicAuthInput ref={passwordInputRef} id="login-password" name="password" className="login-input"
                placeholder={t("auth.v17.passwordPlaceholder")} type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(event) => { setCapsLock(false); handlePasswordBlur(event); }}
                onKeyDown={(event) => { setCapsLock(event.getModifierState("CapsLock")); handleInputKeyDown(event); }}
                onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                autoComplete="current-password" data-testid="input-password" disabled={loading} {...passwordInvalidProps}
                aria-describedby={["login-caps-lock", passwordError ? "login-password-error" : ""].filter(Boolean).join(" ")} />
              <button type="button" onClick={toggleShowPassword} disabled={loading} className="login-password-toggle"
                data-testid="button-toggle-password" aria-controls="login-password"
                aria-label={t(showPassword ? "auth.v17.hidePassword" : "auth.v17.showPassword")} {...getAriaPressedProps(showPassword)}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            <p id="login-caps-lock" className="login-caps-lock" role="status" hidden={!capsLock}>{t("auth.v17.caps")}</p>
            {passwordError ? <p id="login-password-error" className="public-auth-field-error" role="alert">{t("auth.v17.passwordRequired")}</p> : null}
          </div>
          {captchaRequired ? <div className="login-field">
            <label htmlFor="login-captcha-response" className="public-auth-field-label">{t("auth.login.captcha.label")}</label>
            <PublicAuthInput ref={captchaResponseInputRef} id="login-captcha-response" name="captchaResponse"
              placeholder={t("auth.login.captcha.placeholder")} value={captchaResponse}
              onChange={(e) => setCaptchaResponse(e.target.value)} onBlur={handleCaptchaResponseBlur} onKeyDown={handleInputKeyDown}
              autoComplete="off" data-testid="input-captcha-response" disabled={loading} {...captchaInvalidProps} />
            <p id="login-captcha-help" className="login-help">{captchaChallenge || t("auth.v17.captchaHelp")}</p>
            {captchaResponseError ? <p id="login-captcha-error" className="public-auth-field-error" role="alert">{t("auth.v17.captchaRequired")}</p> : null}
          </div> : null}
          <div className="login-actions"><button type="button" className="login-secondary-link" onClick={goToForgotPassword}>{t("auth.v17.forgot")}</button></div>
        </> : (
          <div className="login-field">
            <label htmlFor="login-two-factor-code" className="public-auth-field-label">{t("auth.v17.mfaLabel")}</label>
            <AuthOtpInput ref={twoFactorCodeInputRef} id="login-two-factor-code" name="twoFactorCode"
              value={twoFactorCode} onValueChange={setTwoFactorCode} onBlur={handleTwoFactorCodeBlur}
              onKeyDown={handleInputKeyDown} data-testid="input-two-factor-code" disabled={loading} {...twoFactorInvalidProps} />
            <p id="login-two-factor-help" className="login-help">{t("auth.v17.mfaHelp")}</p>
            {twoFactorCodeError ? <p id="login-two-factor-error" className="public-auth-field-error" role="alert">{t("auth.v17.codeRequired")}</p> : null}
          </div>
        )}
        <PublicAuthButton type="submit" className="login-submit" disabled={loading || lockedFlow || (isTwoFactor && twoFactorCode.length !== 6)} data-testid="button-login">
          {loading ? <span className="login-submit-spinner" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
          {t(loading ? (isTwoFactor ? "auth.v17.verifying" : "auth.v17.signing") : lockedFlow ? "auth.v17.locked" : isTwoFactor ? "auth.v17.verify" : "auth.v17.signin")}
          {!isTwoFactor && !loading ? <ArrowRight size={16} className="login-submit-arrow" aria-hidden="true" /> : null}
        </PublicAuthButton>
      </form>
      {lockedFlow ? <div className="login-locked-alert" role="alert">
        <p>{localizeAuthFeedback(lockedAccountMessage, locale) || t("auth.v17.lockedMessage")}</p>
        <p role="status" aria-live="polite" aria-atomic="true">
          {lockedCountdownSeconds > 0 ? t("auth.v17.retryIn", { seconds: lockedCountdownSeconds }) : t("auth.v17.contactAdmin")}
        </p>
      </div> : null}
      {isTwoFactor ? <>
        <button type="button" onClick={returnToPasswordLogin} className="auth-v17-back">
          <ArrowLeft size={15} aria-hidden="true" />{t("auth.v17.backSignin")}
        </button>
        <p className="login-help">{t("auth.v17.mfaSupport")}</p>
      </> : null}
    </AuthV17Layout>
  );
}
