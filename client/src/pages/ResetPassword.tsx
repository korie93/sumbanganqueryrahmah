import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import {
  resetPasswordWithToken,
  type PasswordResetTokenValidationPayload,
  validatePasswordResetToken,
} from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { broadcastForcedLogout } from "@/lib/auth-session";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";

type ResetPhase = "invalid" | "ready" | "success" | "validating";

function getTokenFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function formatExpiry(value: string) {
  return formatDateTimeDDMMYYYY(value, { fallback: value });
}

export default function ResetPasswordPage() {
  const token = useMemo(() => getTokenFromLocation(), []);
  const [reset, setReset] = useState<PasswordResetTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ResetPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan tetapan semula kata laluan tidak sah.");

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setPhase("invalid");
      setError("Pautan tetapan semula kata laluan tidak sah.");
      return () => {
        cancelled = true;
      };
    }

    const runValidation = async () => {
      setPhase("validating");
      setError("");

      try {
        const response = await validatePasswordResetToken({ token });
        if (cancelled) return;
        setReset(response.reset);
        setPhase("ready");
      } catch (validationError) {
        if (cancelled) return;
        setReset(null);
        setPhase("invalid");
        setError(getApiErrorMessage(validationError, "Pautan tetapan semula tidak sah atau telah tamat tempoh."));
      }
    };

    void runValidation();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResetPassword = async () => {
    if (!reset || loading || phase !== "ready") return;

    if (newPassword !== confirmPassword) {
      setError("Pengesahan kata laluan tidak sepadan.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await resetPasswordWithToken({
        token,
        newPassword,
        confirmPassword,
      });
      broadcastForcedLogout(
        "Sesi lama anda telah tamat kerana kata laluan telah ditetapkan semula. Sila log masuk semula.",
      );
      setNewPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch (resetError) {
      setError(getApiErrorMessage(resetError, "Tetapan semula kata laluan gagal."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicAuthLayout
      badge="Tetapan Semula Kata Laluan"
      title="Cipta Kata Laluan Baharu"
      description="Gunakan pautan selamat yang dihantar ke emel anda untuk menetapkan kata laluan baharu dan mendapatkan semula akses ke sistem."
      icon={
        phase === "invalid" ? (
          <ShieldAlert className="h-7 w-7" />
        ) : phase === "success" ? (
          <BadgeCheck className="h-7 w-7" />
        ) : (
          <KeyRound className="h-7 w-7" />
        )
      }
    >
      {phase === "validating" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
          Sedang mengesahkan pautan tetapan semula anda...
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error || "Pautan tetapan semula tidak sah atau telah tamat tempoh."}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100">
          Tetapan semula kata laluan berjaya. Anda kini boleh log masuk menggunakan username dan
          kata laluan baharu.
        </div>
      ) : null}

      {phase === "ready" && reset ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-200">
            <div><span className="font-semibold text-white">Username:</span> {reset.username}</div>
            <div><span className="font-semibold text-white">Peranan:</span> {reset.role}</div>
            <div><span className="font-semibold text-white">Tamat Tempoh:</span> {formatExpiry(reset.expiresAt)}</div>
          </div>
          <PublicAuthInput
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Kata laluan baharu"
          />
          <PublicAuthInput
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Sahkan kata laluan baharu"
          />
          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          <PublicAuthButton
            onClick={() => void handleResetPassword()}
            disabled={loading}
          >
            {loading ? "Sedang menetapkan semula..." : "Tetapkan Kata Laluan Baharu"}
          </PublicAuthButton>
        </>
      ) : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={() => {
          window.location.href = "/";
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Kembali ke log masuk
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
