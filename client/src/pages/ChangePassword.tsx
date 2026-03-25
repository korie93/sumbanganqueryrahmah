import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changeMyPassword } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { clearAuthenticatedUserStorage } from "@/lib/auth-session";

type ChangePasswordPageProps = {
  username?: string;
  forced?: boolean;
};

export default function ChangePasswordPage({
  username,
  forced = false,
}: ChangePasswordPageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const mountedRef = useRef(true);
  const changePasswordAbortControllerRef = useRef<AbortController | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      changePasswordAbortControllerRef.current?.abort();
      changePasswordAbortControllerRef.current = null;
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  const handleLogout = () => {
    changePasswordAbortControllerRef.current?.abort();
    changePasswordAbortControllerRef.current = null;
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    clearAuthenticatedUserStorage();
    window.location.href = "/";
  };

  const handleSubmit = async () => {
    if (loading || changePasswordAbortControllerRef.current) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("All password fields are required.");
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Confirm password does not match.");
        return;
      }

      const controller = new AbortController();
      changePasswordAbortControllerRef.current = controller;

      const response = await changeMyPassword({
        currentPassword,
        newPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      if (response?.forceLogout) {
        clearAuthenticatedUserStorage();
        setSuccessMessage("Password updated. Please login again.");
        if (redirectTimeoutRef.current) {
          window.clearTimeout(redirectTimeoutRef.current);
        }
        redirectTimeoutRef.current = window.setTimeout(() => {
          redirectTimeoutRef.current = null;
          window.location.href = "/";
        }, 900);
        return;
      }

      localStorage.removeItem("forcePasswordChange");
      setSuccessMessage("Password updated successfully.");
    } catch (submitError) {
      if (
        (submitError instanceof DOMException && submitError.name === "AbortError") ||
        !mountedRef.current
      ) {
        return;
      }
      setError(getApiErrorMessage(submitError, "Failed to change password."));
    } finally {
      changePasswordAbortControllerRef.current = null;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4">
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
        <Card className="w-full border-white/10 bg-slate-950/70 text-white shadow-2xl backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10">
                <KeyRound className="h-7 w-7" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl">Change Password</CardTitle>
            <p className="text-center text-sm text-slate-300">
              {forced
                ? `Password update is required for ${username || "this account"} before using the application.`
                : "Update your account password."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              className="border-white/10 bg-white/95 text-slate-950"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              className="border-white/10 bg-white/95 text-slate-950"
            />
            <Input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className="border-white/10 bg-white/95 text-slate-950"
            />

            {error ? (
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                {successMessage}
              </div>
            ) : null}

            <Button
              className="w-full"
              onClick={() => void handleSubmit()}
              disabled={loading}
            >
              {loading ? "Updating..." : "Update Password"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-slate-200 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
