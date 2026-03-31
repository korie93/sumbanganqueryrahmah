import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import type { User } from "@/app/types";
import { BrandLogo } from "@/components/BrandLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { login, generateFingerprint, verifyTwoFactorLogin } from "@/lib/api";
import {
  consumeStoredAuthNotice,
  persistAuthenticatedUser,
  setBannedSessionFlag,
  setStoredActivityId,
  setStoredFingerprint,
} from "@/lib/auth-session";
import { isLockedAccountFlow, normalizeLoginIdentity } from "@/pages/login-lock-state";
import { ERROR_CODES } from "@shared/error-codes";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lockedAccountMessage, setLockedAccountMessage] = useState("");
  const [lockedUsername, setLockedUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const mountedRef = useRef(true);
  const loginInFlightRef = useRef(false);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const loginRequestIdRef = useRef(0);
  const lockedFlow = isLockedAccountFlow({
    lockedUsername,
    currentUsername: username,
    twoFactorChallengeToken,
  });

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    if (!isLockedAccountFlow({
      lockedUsername,
      currentUsername: value,
      twoFactorChallengeToken,
    })) {
      setError("");
      setNotice("");
    }
  };

  useEffect(() => {
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

  const handleLogin = async () => {
    if (loginInFlightRef.current) {
      return;
    }
    if (lockedFlow) {
      return;
    }

    loginInFlightRef.current = true;
    const requestId = loginRequestIdRef.current + 1;
    loginRequestIdRef.current = requestId;
    setError("");
    setNotice("");
    setLockedAccountMessage("");
    setLoading(true);
    let controller: AbortController | null = null;

    try {
      if (!username.trim() || !password) {
        if (mountedRef.current && loginRequestIdRef.current === requestId) {
          setError("Sila masukkan username dan password.");
        }
        return;
      }

      controller = new AbortController();
      loginAbortControllerRef.current = controller;
      const fingerprint = await generateFingerprint();
      if (!mountedRef.current || loginRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }

      const response = await login(username, password, fingerprint, {
        signal: controller.signal,
      });

      if (!mountedRef.current || loginRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }

      if ("banned" in response) {
        setBannedSessionFlag(true);
        window.location.href = "/banned";
        return;
      }

      if ("twoFactorRequired" in response && response.twoFactorRequired === true) {
        setStoredFingerprint(fingerprint);
        setLockedUsername("");
        setLockedAccountMessage("");
        setTwoFactorChallengeToken(String(response.challengeToken || ""));
        setTwoFactorCode("");
        setNotice("Masukkan kod pengesah 6 digit untuk melengkapkan log masuk.");
        return;
      }

      const loginSuccessResponse = response as Exclude<typeof response, { twoFactorRequired: true }>;
      const { username: responseUsername, role, activityId } = loginSuccessResponse;

      if (!responseUsername || !role) {
        throw new Error("Maklumat log masuk daripada server tidak lengkap.");
      }

      const authenticatedUser: User = {
        id: loginSuccessResponse?.user?.id,
        username: String(loginSuccessResponse?.user?.username || responseUsername).toLowerCase(),
        fullName: loginSuccessResponse?.user?.fullName ?? null,
        email: loginSuccessResponse?.user?.email ?? null,
        role: String(loginSuccessResponse?.user?.role || role),
        status: String(loginSuccessResponse?.user?.status || loginSuccessResponse?.status || "active"),
        mustChangePassword: Boolean(
          loginSuccessResponse?.user?.mustChangePassword ?? loginSuccessResponse?.mustChangePassword ?? false,
        ),
        passwordResetBySuperuser: Boolean(
          loginSuccessResponse?.user?.passwordResetBySuperuser ?? false,
        ),
        isBanned: loginSuccessResponse?.user?.isBanned ?? null,
        twoFactorEnabled: Boolean(loginSuccessResponse?.user?.twoFactorEnabled ?? false),
        twoFactorPendingSetup: Boolean(loginSuccessResponse?.user?.twoFactorPendingSetup ?? false),
        twoFactorConfiguredAt: loginSuccessResponse?.user?.twoFactorConfiguredAt ?? null,
      };

      setBannedSessionFlag(false);
      setStoredFingerprint(fingerprint);
      persistAuthenticatedUser(authenticatedUser);
      setLockedUsername("");
      setLockedAccountMessage("");

      if (activityId) {
        setStoredActivityId(String(activityId));
      }

      const defaultTab = authenticatedUser.mustChangePassword
        ? "change-password"
        : role === "admin" || role === "superuser"
          ? "home"
          : "general-search";
      localStorage.setItem("activeTab", defaultTab);
      localStorage.setItem("lastPage", defaultTab);

      onLoginSuccess(authenticatedUser);
    } catch (err: any) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if (!mountedRef.current || loginRequestIdRef.current !== requestId) {
        return;
      }
      console.error("Login failed:", err);
      let msg = err?.message || "Login failed. Please try again.";
      if (err?.code === ERROR_CODES.ACCOUNT_LOCKED || err?.locked === true) {
        setLockedUsername(normalizeLoginIdentity(username));
        setLockedAccountMessage(msg);
        setError("");
        return;
      }
      if (msg.includes("Account is banned") || msg.includes('"banned":true')) {
        msg = "Your account has been banned. Please contact administrator.";
      }
      setError(msg);
    } finally {
      if (loginAbortControllerRef.current === controller) {
        loginAbortControllerRef.current = null;
      }
      if (loginRequestIdRef.current === requestId) {
        loginInFlightRef.current = false;
      }
      if (mountedRef.current && loginRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (loginInFlightRef.current) {
      return;
    }

    loginInFlightRef.current = true;
    const requestId = loginRequestIdRef.current + 1;
    loginRequestIdRef.current = requestId;
    setError("");
    setNotice("");
    setLoading(true);
    let controller: AbortController | null = null;

    try {
      if (!twoFactorChallengeToken.trim()) {
        throw new Error("Sesi pengesahan dua faktor tiada. Sila log masuk semula.");
      }

      const normalizedCode = twoFactorCode.replace(/\D/g, "").slice(0, 6);
      if (normalizedCode.length !== 6) {
        throw new Error("Sila masukkan kod pengesah 6 digit.");
      }

      controller = new AbortController();
      loginAbortControllerRef.current = controller;
      const response = await verifyTwoFactorLogin(
        {
          challengeToken: twoFactorChallengeToken,
          code: normalizedCode,
        },
        { signal: controller.signal },
      );

      if (!mountedRef.current || loginRequestIdRef.current !== requestId || controller.signal.aborted) {
        return;
      }

      const { username: responseUsername, role, activityId } = response;

      if (!responseUsername || !role) {
        throw new Error("Maklumat log masuk daripada server tidak lengkap.");
      }

      const authenticatedUser: User = {
        id: response?.user?.id,
        username: String(response?.user?.username || responseUsername).toLowerCase(),
        fullName: response?.user?.fullName ?? null,
        email: response?.user?.email ?? null,
        role: String(response?.user?.role || role),
        status: String(response?.user?.status || response?.status || "active"),
        mustChangePassword: Boolean(
          response?.user?.mustChangePassword ?? response?.mustChangePassword ?? false,
        ),
        passwordResetBySuperuser: Boolean(response?.user?.passwordResetBySuperuser ?? false),
        isBanned: response?.user?.isBanned ?? null,
        twoFactorEnabled: Boolean(response?.user?.twoFactorEnabled ?? false),
        twoFactorPendingSetup: Boolean(response?.user?.twoFactorPendingSetup ?? false),
        twoFactorConfiguredAt: response?.user?.twoFactorConfiguredAt ?? null,
      };

      setBannedSessionFlag(false);
      persistAuthenticatedUser(authenticatedUser);
      setLockedUsername("");
      setLockedAccountMessage("");

      if (activityId) {
        setStoredActivityId(String(activityId));
      }

      const defaultTab = authenticatedUser.mustChangePassword
        ? "change-password"
        : role === "admin" || role === "superuser"
          ? "home"
          : "general-search";
      localStorage.setItem("activeTab", defaultTab);
      localStorage.setItem("lastPage", defaultTab);
      setTwoFactorChallengeToken("");
      setTwoFactorCode("");

      onLoginSuccess(authenticatedUser);
    } catch (err: any) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if (!mountedRef.current || loginRequestIdRef.current !== requestId) {
        return;
      }
      console.error("Two-factor verification failed:", err);
      if (err?.code === ERROR_CODES.ACCOUNT_LOCKED || err?.locked === true) {
        setTwoFactorChallengeToken("");
        setTwoFactorCode("");
        setLockedUsername(normalizeLoginIdentity(username));
        setLockedAccountMessage(err?.message || "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah.");
        setError("");
        return;
      }
      setError(err?.message || "Pengesahan dua faktor gagal. Sila cuba lagi.");
    } finally {
      if (loginAbortControllerRef.current === controller) {
        loginAbortControllerRef.current = null;
      }
      if (loginRequestIdRef.current === requestId) {
        loginInFlightRef.current = false;
      }
      if (mountedRef.current && loginRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lockedFlow) {
      return;
    }
    void (twoFactorChallengeToken ? handleVerifyTwoFactor() : handleLogin());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (lockedFlow) {
        return;
      }
      void (twoFactorChallengeToken ? handleVerifyTwoFactor() : handleLogin());
    }
  };

  return (
    <div className="relative w-full viewport-min-height overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="login-bg-effect absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDNhNTUiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="login-bg-effect absolute top-20 left-20 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl floating-slow" />
      <div className="login-bg-effect absolute bottom-20 right-20 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl floating-slow delay-150" />
      <div className="login-bg-effect absolute top-1/2 left-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/8 blur-3xl floating-slow delay-300" />

      <div className="relative z-10 flex items-center justify-center viewport-min-height px-4 login-content">
        <div className="relative w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Kembali ke landing page
          </button>

          <div className="login-bg-effect pointer-events-none absolute -inset-4 rounded-[2rem] bg-blue-400/12 blur-2xl" />

          <div className="login-card px-8 py-10">
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

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="relative">
                <Input
                  className="w-full px-4 py-3 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  autoComplete="username"
                  data-testid="input-username"
                  autoFocus
                  disabled={loading || Boolean(twoFactorChallengeToken)}
                />
              </div>

              {twoFactorChallengeToken ? (
                <div className="space-y-2">
                  <Input
                    className="w-full px-4 py-3 rounded-xl bg-white/90 border-0 text-center tracking-[0.45em] text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="000000"
                    inputMode="numeric"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={onKeyDown}
                    autoComplete="one-time-code"
                    data-testid="input-two-factor-code"
                  />
                  <p className="text-center text-xs text-white/70">
                    Masukkan kod 6 digit daripada aplikasi pengesah anda.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                    placeholder="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKeyDown}
                    autoComplete="current-password"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                    data-testid="button-toggle-password"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              )}

              <Button
                type="submit"
                className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all"
                disabled={loading || lockedFlow}
                data-testid="button-login"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {twoFactorChallengeToken ? "Mengesahkan..." : "Sedang log masuk..."}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="w-5 h-5" />
                    {lockedFlow ? "Akaun Dikunci" : twoFactorChallengeToken ? "Sahkan Kod" : "Log In"}
                  </div>
                )}
              </Button>
            </form>

            {lockedFlow ? (
              <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-3 text-center text-sm text-amber-50">
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
                onClick={() => {
                  setTwoFactorChallengeToken("");
                  setTwoFactorCode("");
                  setNotice("");
                  setError("");
                  setLockedAccountMessage("");
                }}
                className="mt-3 w-full text-center text-sm text-white/75 transition-colors hover:text-white"
              >
                Kembali ke log masuk kata laluan
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                window.location.href = "/forgot-password";
              }}
              className="mt-4 w-full text-center text-sm text-white/75 transition-colors hover:text-white"
            >
              Lupa kata laluan?
            </button>

            {error && !lockedFlow && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-center text-sm">
                {error}
              </div>
            )}

            {notice && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-center text-sm">
                {notice}
              </div>
            )}

            <div className="text-center mt-8 text-white/50 text-xs">
              Hak cipta terpelihara. Sumbangan Query Rahmah.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
