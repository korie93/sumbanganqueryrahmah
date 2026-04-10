import { useEffect, useRef } from "react";
import { AuthenticatedAppEntry } from "@/app/authenticated-entry-lazy";
import { Eye, EyeOff, LogIn } from "lucide-react";
import type { User } from "@/app/types";
import { BrandLogo } from "@/components/BrandLogo";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { scheduleIdlePreload } from "@/lib/lazy-with-preload";
import { useLoginPageState } from "@/pages/useLoginPageState";
import "./Login.css";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const hasPreloadedAuthenticatedShellRef = useRef(false);
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
    lockedFlow,
    setPassword,
    setTwoFactorCode,
    handleUsernameChange,
    handleSubmit,
    handleInputKeyDown,
    toggleShowPassword,
    returnToPasswordLogin,
    goToLandingPage,
    goToForgotPassword,
  } = useLoginPageState({ onLoginSuccess });
  const hasAuthenticationIntent =
    Boolean(twoFactorChallengeToken)
    || username.trim().length > 0
    || password.length > 0
    || twoFactorCode.length > 0;

  useEffect(() => {
    if (!hasAuthenticationIntent || hasPreloadedAuthenticatedShellRef.current) {
      return;
    }

    hasPreloadedAuthenticatedShellRef.current = true;
    return scheduleIdlePreload(() => {
      void AuthenticatedAppEntry.preload();
    }, 150);
  }, [hasAuthenticationIntent]);

  const loginFormBusyProps = loading ? { "aria-busy": "true" as const } : {};
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

  return (
    <div className="login-page relative w-full viewport-min-height overflow-hidden">
      <div className="login-bg-effect login-bg-pattern absolute inset-0 opacity-30" />
      
      <div className="login-bg-effect login-bg-orb login-bg-orb--top absolute left-20 top-20 hidden h-56 w-56 floating-slow sm:block" />
      <div className="login-bg-effect login-bg-orb login-bg-orb--bottom absolute bottom-20 right-20 hidden h-72 w-72 floating-slow delay-150 sm:block" />
      <div className="login-bg-effect login-bg-orb login-bg-orb--center absolute left-1/2 top-1/2 hidden h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 floating-slow delay-300 md:block" />

      <main className="relative z-[var(--z-public-auth-main)] flex viewport-min-height items-center justify-center px-4 py-6 login-content sm:py-8">
        <div className="relative w-full max-w-md">
          <button
            type="button"
            onClick={goToLandingPage}
            className="login-back-button mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors"
          >
            Kembali ke landing page
          </button>

          <div className="login-bg-effect login-halo pointer-events-none absolute -inset-4 hidden rounded-[2rem] blur-2xl sm:block" />

          <div className="login-card px-5 py-7 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center mb-8">
              <div className="login-brand-mark mb-4 flex h-20 w-20 items-center justify-center rounded-full backdrop-blur-md shadow-xl">
                <BrandLogo
                  decorative
                  priority
                  className="block h-11 w-11"
                  imageClassName="h-full w-full"
                />
              </div>
              <h2 className="login-title text-center text-2xl font-bold tracking-tight">
                Log In SQR System
              </h2>
              <p className="login-subtitle mt-2 text-sm">
                Platform operasi dalaman Sumbangan Query Rahmah
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit} {...loginFormBusyProps}>
              <div className="space-y-2">
                <PublicAuthInput
                  className="login-input w-full rounded-xl px-4 py-3 transition-all"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  autoComplete="username"
                  data-testid="input-username"
                  autoFocus
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
                  <PublicAuthInput
                    className="login-input w-full rounded-xl px-4 py-3 text-center tracking-[0.45em] transition-all"
                    placeholder="000000"
                    inputMode="numeric"
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
                  <div className="relative">
                    <PublicAuthInput
                      className="login-input w-full rounded-xl px-4 py-3 pr-12 transition-all"
                      placeholder="Password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      autoComplete="current-password"
                      data-testid="input-password"
                      disabled={loading}
                      {...passwordInvalidProps}
                    />
                    <button
                      type="button"
                      onClick={toggleShowPassword}
                      disabled={loading}
                      className="login-password-toggle absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl transition-colors"
                      data-testid="button-toggle-password"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordError ? (
                    <p id="login-password-error" className="login-field-error text-sm" role="alert">
                      {passwordError}
                    </p>
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
                    <LogIn className="w-5 h-5" />
                    {lockedFlow ? "Akaun Dikunci" : twoFactorChallengeToken ? "Sahkan Kod" : "Log In"}
                  </div>
                )}
              </PublicAuthButton>
            </form>

            {lockedFlow ? (
              <div className="login-alert login-alert--warning mt-4 text-sm" role="alert">
                <div className="font-medium">
                  {lockedAccountMessage || "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."}
                </div>
                <div className="login-alert--warning-subtext mt-1 text-xs">
                  Sila hubungi pentadbir sistem untuk pengaktifan semula akaun.
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
                {error}
              </div>
            )}

            {notice && (
              <div className="login-alert login-alert--success mt-4 text-sm" role="status" aria-live="polite">
                {notice}
              </div>
            )}

            <div className="login-footer mt-8 text-center text-xs">
              Hak cipta terpelihara. Sumbangan Query Rahmah.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
