import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  activateAccount,
  type ActivationTokenValidationPayload,
  validateActivationToken,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";

type ActivationPhase = "invalid" | "ready" | "success" | "validating";
const AUTH_NOTICE_STORAGE_KEY = "auth_notice";

function getTokenFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function formatExpiry(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function ActivateAccountPage() {
  const token = useMemo(() => getTokenFromLocation(), []);
  const [activation, setActivation] = useState<ActivationTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ActivationPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Activation link is invalid.");

  useEffect(() => {
    if (phase !== "success" || !activation) return;

    sessionStorage.setItem(
      AUTH_NOTICE_STORAGE_KEY,
      JSON.stringify({
        message: `Account for ${activation.username} is ready. Please login using your new password.`,
        type: "success",
      }),
    );

    const timeoutId = window.setTimeout(() => {
      window.location.href = "/";
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activation, phase]);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setPhase("invalid");
      setError("Activation link is invalid.");
      return () => {
        cancelled = true;
      };
    }

    const runValidation = async () => {
      setPhase("validating");
      setError("");

      try {
        const response = await validateActivationToken({ token });
        if (cancelled) return;
        setActivation(response.activation);
        setPhase("ready");
      } catch (validationError) {
        if (cancelled) return;
        setActivation(null);
        setPhase("invalid");
        setError(getApiErrorMessage(validationError, "Activation link is invalid or expired."));
      }
    };

    void runValidation();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleActivate = async () => {
    if (!activation || loading || phase !== "ready") return;

    if (newPassword !== confirmPassword) {
      setError("Confirm password does not match.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await activateAccount({
        username: activation.username,
        token,
        newPassword,
        confirmPassword,
      });
      setNewPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch (activationError) {
      setError(getApiErrorMessage(activationError, "Activation failed."));
    } finally {
      setLoading(false);
    }
  };

  const onPasswordKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void handleActivate();
    }
  };

  const title =
    phase === "success"
      ? "Password Created"
      : phase === "ready"
        ? "Create Password"
        : "Activate Account";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4">
      <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
        <Card className="w-full border-white/10 bg-slate-950/70 text-white shadow-2xl backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10">
                {phase === "invalid" ? (
                  <ShieldAlert className="h-7 w-7" />
                ) : phase === "success" ? (
                  <BadgeCheck className="h-7 w-7" />
                ) : (
                  <KeyRound className="h-7 w-7" />
                )}
              </div>
            </div>
            <CardTitle className="text-center text-2xl">{title}</CardTitle>
            <p className="text-center text-sm text-slate-300">
              Complete first-time setup using the activation link sent to your email.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === "validating" ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                Validating your activation link...
              </div>
            ) : null}

            {phase === "invalid" ? (
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
                {error || "Activation link is invalid or expired."}
              </div>
            ) : null}

            {phase === "success" ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Password created successfully. Redirecting you to the main login page...
              </div>
            ) : null}

            {phase === "ready" && activation ? (
              <>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                  <div><span className="font-semibold text-white">Username:</span> {activation.username}</div>
                  <div><span className="font-semibold text-white">Role:</span> {activation.role}</div>
                  <div><span className="font-semibold text-white">Expires:</span> {formatExpiry(activation.expiresAt)}</div>
                </div>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  onKeyDown={onPasswordKeyDown}
                  placeholder="New password"
                  className="border-white/10 bg-white/95 text-slate-950"
                  autoFocus
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  onKeyDown={onPasswordKeyDown}
                  placeholder="Confirm password"
                  className="border-white/10 bg-white/95 text-slate-950"
                />
                {error ? (
                  <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  onClick={() => void handleActivate()}
                  disabled={loading}
                >
                  {loading ? "Creating password..." : "Create Password"}
                </Button>
              </>
            ) : null}

            {phase === "success" ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Go to Login Now
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              className="w-full text-slate-200 hover:text-white"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
