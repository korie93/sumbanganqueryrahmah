import { useEffect, useState } from "react";
import { Eye, EyeOff, LogIn, Lock } from "lucide-react";
import type { User } from "@/app/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { login, generateFingerprint } from "@/lib/api";
import { persistAuthenticatedUser } from "@/lib/auth-session";

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const AUTH_NOTICE_STORAGE_KEY = "auth_notice";

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const rawNotice = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);
    if (!rawNotice) return;

    try {
      const parsed = JSON.parse(rawNotice) as { message?: string };
      const message = String(parsed?.message || "").trim();
      if (message) {
        setNotice(message);
      }
    } catch {
      // Ignore malformed notice payloads and continue with normal login.
    } finally {
      sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
    }
  }, []);

  const handleLogin = async () => {
    setError("");
    setNotice("");
    setLoading(true);

    try {
      if (!username.trim() || !password) {
        setError("Please enter username and password.");
        setLoading(false);
        return;
      }

      const fingerprint = await generateFingerprint();
      const response = await login(username, password, fingerprint);

      if (response.banned) {
        localStorage.setItem("banned", "1");
        window.location.href = "/banned";
        return;
      }

      const { token, username: responseUsername, role, activityId } = response;
      
      if (!token || !responseUsername || !role) {
        throw new Error("Incomplete login information from server.");
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
        passwordResetBySuperuser: Boolean(
          response?.user?.passwordResetBySuperuser ?? false,
        ),
        isBanned: response?.user?.isBanned ?? null,
      };

      localStorage.removeItem("banned");
      localStorage.setItem("token", token);
      localStorage.setItem("fingerprint", fingerprint);
      persistAuthenticatedUser(authenticatedUser);

      if (activityId) {
        localStorage.setItem("activityId", String(activityId));
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
      console.error("Login failed:", err);
      let msg = err?.message || "Login failed. Please try again.";
      if (msg.includes("Account is banned") || msg.includes('"banned":true')) {
        msg = "Your account has been banned. Please contact administrator.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDNhNTUiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
      
      <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl floating-slow" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl floating-slow delay-150" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-3xl floating-slow delay-300" />

      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 login-content">
        <div className="relative w-full max-w-md">
          <div className="absolute -inset-6 rounded-[2.5rem] bg-blue-400/20 blur-3xl pointer-events-none" />

          <div className="login-card px-8 py-10">
            <div className="flex flex-col items-center mb-8">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 shadow-xl border border-white/30">
                <Lock className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight text-center">
                Log In SQR System
              </h2>
              <p className="text-sm text-white/70 mt-2">
                Sumbangan Query Rahmah
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Input
                  className="w-full px-4 py-3 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={onKeyDown}
                  data-testid="input-username"
                  autoFocus
                />
              </div>

              <div className="relative">
                <Input
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-white/90 border-0 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400 transition-all"
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKeyDown}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              className="mt-6 w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all"
              onClick={handleLogin}
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  Log In
                </div>
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/forgot-password";
              }}
              className="mt-4 w-full text-center text-sm text-white/75 transition-colors hover:text-white"
            >
              Forgot password?
            </button>

            {error && (
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
              Copyright 2025 Ministry of Madanon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
