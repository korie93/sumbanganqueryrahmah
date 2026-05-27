import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, LogIn } from "lucide-react";
import type { User } from "@/app/types";
import { BrandLogo } from "@/components/BrandLogo";
import { ExpandableMessage } from "@/components/ExpandableMessage";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { shouldAutoFocusPublicAuthField } from "@/lib/interaction-media";
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
    if (!lockedFlow || !lockedRetryUntilMs) {
      setLockedCountdownMs(0);
      return;
    }

    const refreshCountdown = () => {
      setLockedCountdownMs(Math.max(0, lockedRetryUntilMs - Date.now()));
    };
    refreshCountdown();
    const intervalId = window.setInterval(refreshCountdown, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lockedFlow, lockedRetryUntilMs]);

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
            <div className="login-card-aside" aria-hidden="true">
              <div className="login-aside-kicker">Akses SQR</div>
              <div className="login-aside-title">Log masuk pantas untuk operasi harian.</div>
              <div className="login-aside-copy">
                Satu pintu masuk yang ringkas, pantas, dan jelas untuk pasukan operasi.
              </div>
              <div className="login-aside-metrics">
                <span>2FA tersedia</span>
                <span>Sesi dilindungi</span>
              </div>
            </div>

            <div className="login-card-form">
              <div className="login-brand mb-7 flex flex-col items-center">
                <div className="login-brand-mark mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg">
                  <BrandLogo
                    decorative
                    priority
                    className="block h-10 w-10"
                    imageClassName="h-full w-full"
                  />
                </div>
                <h1 className="login-title text-center text-2xl font-bold">
                  Log Masuk SQR
                </h1>
                <p className="login-subtitle mt-2 text-center text-sm">
                  Platform operasi dalaman Sumbangan Query Rahmah
                </p>
              </div>

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
                      id="login-two-factor-code"
                      name="twoFactorCode"
                      className="login-input login-input--otp w-full rounded-xl px-4 py-3 text-center transition-all"
                      placeholder="000000"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
                        id="login-password"
                        name="password"
                        className="login-input w-full rounded-xl px-4 py-3 pr-12 transition-all"
                        placeholder="Masukkan kata laluan"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        autoComplete="current-password"
                        data-testid="input-password"
                        disabled={loading}
                        {...passwordInvalidProps}
                      />
                      {showPassword ? (
                        <button
                          type="button"
                          onClick={toggleShowPassword}
                          disabled={loading}
                          className="login-password-toggle absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl transition-colors"
                          data-testid="button-toggle-password"
                          aria-label="Sembunyi kata laluan"
                          aria-pressed="true"
                          title="Sembunyi kata laluan"
                        >
                          <EyeOff className="h-5 w-5" aria-hidden="true" focusable="false" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={toggleShowPassword}
                          disabled={loading}
                          className="login-password-toggle absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl transition-colors"
                          data-testid="button-toggle-password"
                          aria-label="Papar kata laluan"
                          aria-pressed="false"
                          title="Papar kata laluan"
                        >
                          <Eye className="h-5 w-5" aria-hidden="true" focusable="false" />
                        </button>
                      )}
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
                          id="login-captcha-response"
                          name="captchaResponse"
                          className="login-input w-full rounded-xl px-4 py-3 transition-all"
                          placeholder="Masukkan jawapan"
                          value={captchaResponse}
                          onChange={(e) => setCaptchaResponse(e.target.value)}
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
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="login-submit-spinner h-5 w-5 animate-spin rounded-full border-2" aria-hidden="true" />
                      {twoFactorChallengeToken ? "Mengesahkan..." : "Sedang log masuk..."}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <LogIn className="h-5 w-5" aria-hidden="true" focusable="false" />
                      {lockedFlow ? "Akaun Dikunci" : twoFactorChallengeToken ? "Sahkan Kod" : "Log Masuk"}
                    </div>
                  )}
                </PublicAuthButton>
              </form>

              {lockedFlow ? (
                <div className="login-alert login-alert--warning mt-4 text-sm" role="alert">
                  <div className="font-medium">
                    <ExpandableMessage>
                      {lockedAccountMessage || "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."}
                    </ExpandableMessage>
                  </div>
                  <div className="login-alert--warning-subtext mt-1 text-xs">
                    {lockedCountdownSeconds > 0
                      ? `Sila cuba semula dalam ${lockedCountdownSeconds} saat.`
                      : "Sila hubungi pentadbir sistem untuk pengaktifan semula akaun."}
                  </div>
                </div>
              ) : null}

              {twoFactorChallengeToken ? (
                <button
                  type="button"
                  onClick={returnToPasswordLogin}
                  className="login-secondary-link mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm transition-colors"
                >
                  Kembali ke log masuk kata laluan
                </button>
              ) : null}

              <button
                type="button"
                onClick={goToForgotPassword}
                className="login-secondary-link mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm transition-colors"
              >
                Lupa kata laluan?
              </button>

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

              <div className="login-footer mt-7 text-center text-xs">
                Sumbangan Query Rahmah
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
