import { Eye, EyeOff, LogIn } from "lucide-react";
import type { User } from "@/app/types";
import { BrandLogo } from "@/components/BrandLogo";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { useLoginPageState } from "@/pages/useLoginPageState";
import "./Login.css";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const {
    username,
    password,
    error,
    notice,
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
  const loginFormBusyProps = loading ? { "aria-busy": "true" as const } : {};

  return (
    <div className="relative w-full viewport-min-height overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="login-bg-effect absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDNhNTUiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="login-bg-effect absolute left-20 top-20 hidden h-56 w-56 rounded-full bg-blue-500/15 blur-3xl floating-slow sm:block" />
      <div className="login-bg-effect absolute bottom-20 right-20 hidden h-72 w-72 rounded-full bg-purple-500/15 blur-3xl floating-slow delay-150 sm:block" />
      <div className="login-bg-effect absolute left-1/2 top-1/2 hidden h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/8 blur-3xl floating-slow delay-300 md:block" />

      <main className="relative z-10 flex viewport-min-height items-center justify-center px-4 py-6 login-content sm:py-8">
        <div className="relative w-full max-w-md">
          <button
            type="button"
            onClick={goToLandingPage}
            className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Kembali ke landing page
          </button>

          <div className="login-bg-effect pointer-events-none absolute -inset-4 hidden rounded-[2rem] bg-blue-400/12 blur-2xl sm:block" />

          <div className="login-card px-5 py-7 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center mb-8">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 shadow-xl border border-white/30">
                <BrandLogo
                  decorative
                  priority
                  className="block h-11 w-11"
                  imageClassName="h-full w-full"
                />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight text-center">
                Log In SQR System
              </h2>
              <p className="text-sm text-white/70 mt-2">
                Platform operasi dalaman Sumbangan Query Rahmah
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit} {...loginFormBusyProps}>
              <div className="relative">
                <PublicAuthInput
                  className="w-full px-4 py-3 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  autoComplete="username"
                  data-testid="input-username"
                  autoFocus
                  disabled={loading || Boolean(twoFactorChallengeToken)}
                />
              </div>

              {twoFactorChallengeToken ? (
                <div className="space-y-2">
                  <PublicAuthInput
                    className="w-full px-4 py-3 rounded-xl bg-white/90 border-0 text-center tracking-[0.45em] text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="000000"
                    inputMode="numeric"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={handleInputKeyDown}
                    autoComplete="one-time-code"
                    data-testid="input-two-factor-code"
                    disabled={loading}
                  />
                  <p className="text-center text-xs text-white/70">
                    Masukkan kod 6 digit daripada aplikasi pengesah anda.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <PublicAuthInput
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    autoComplete="current-password"
                    data-testid="input-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={toggleShowPassword}
                    disabled={loading}
                    className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:text-slate-700"
                    data-testid="button-toggle-password"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              )}

              <PublicAuthButton
                type="submit"
                className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all"
                disabled={loading || lockedFlow}
                data-testid="button-login"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
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
              <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-3 text-center text-sm text-amber-50" role="alert">
                <div className="font-medium">
                  {lockedAccountMessage || "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."}
                </div>
                <div className="mt-1 text-xs text-amber-100/90">
                  Sila hubungi pentadbir sistem untuk pengaktifan semula akaun.
                </div>
              </div>
            ) : null}

            {twoFactorChallengeToken ? (
              <button
                type="button"
                onClick={returnToPasswordLogin}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm text-white/75 transition-colors hover:bg-white/5 hover:text-white"
              >
                Kembali ke log masuk kata laluan
              </button>
            ) : null}

            <button
              type="button"
              onClick={goToForgotPassword}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm text-white/75 transition-colors hover:bg-white/5 hover:text-white"
            >
              Lupa kata laluan?
            </button>

            {error && !lockedFlow && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-center text-sm" role="alert">
                {error}
              </div>
            )}

            {notice && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-center text-sm" role="status" aria-live="polite">
                {notice}
              </div>
            )}

            <div className="text-center mt-8 text-white/50 text-xs">
              Hak cipta terpelihara. Sumbangan Query Rahmah.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
