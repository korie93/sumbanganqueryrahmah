import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";
import {
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";

type ResetPhase = "invalid" | "ready" | "success" | "validating";

export default function ResetPasswordPage() {
  const token = useMemo(() => getPublicAuthTokenFromLocation(), []);
  const [reset, setReset] = useState<PasswordResetTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ResetPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan tetapan semula kata laluan tidak sah.");
  const mountedRef = useRef(true);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const resetAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      validationAbortControllerRef.current?.abort();
      validationAbortControllerRef.current = null;
      resetAbortControllerRef.current?.abort();
      resetAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setError("Pautan tetapan semula kata laluan tidak sah.");
      return undefined;
    }

    validationAbortControllerRef.current?.abort();
    const controller = new AbortController();
    validationAbortControllerRef.current = controller;

    const runValidation = async () => {
      setPhase("validating");
      setError("");

      try {
        const response = await validatePasswordResetToken({ token }, { signal: controller.signal });
        if (!mountedRef.current || controller.signal.aborted) return;
        setReset(response.reset);
        setPhase("ready");
      } catch (validationError) {
        if (
          isPublicAuthAbortError(validationError)
          || !mountedRef.current
          || controller.signal.aborted
        ) {
          return;
        }
        setReset(null);
        setPhase("invalid");
        setError(getApiErrorMessage(validationError, "Pautan tetapan semula tidak sah atau telah tamat tempoh."));
      } finally {
        if (validationAbortControllerRef.current === controller) {
          validationAbortControllerRef.current = null;
        }
      }
    };

    void runValidation();
    return () => {
      controller.abort();
      if (validationAbortControllerRef.current === controller) {
        validationAbortControllerRef.current = null;
      }
    };
  }, [token]);

  const handleResetPassword = async () => {
    if (!reset || loading || phase !== "ready" || resetAbortControllerRef.current) return;

    setError("");
    setNewPasswordError("");
    setConfirmPasswordError("");

    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    if (hasPublicAuthFieldErrors(fieldErrors)) {
      setNewPasswordError(fieldErrors.newPassword ?? "");
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    resetAbortControllerRef.current = controller;

    try {
      await resetPasswordWithToken({
        token,
        newPassword,
        confirmPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      broadcastForcedLogout(
        "Sesi lama anda telah tamat kerana kata laluan telah ditetapkan semula. Sila log masuk semula.",
      );
      setNewPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch (resetError) {
      if (
        isPublicAuthAbortError(resetError)
        || !mountedRef.current
        || controller.signal.aborted
      ) {
        return;
      }
      setError(getApiErrorMessage(resetError, "Tetapan semula kata laluan gagal."));
    } finally {
      if (resetAbortControllerRef.current === controller) {
        resetAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const newPasswordInvalidProps = newPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "reset-password-new-error",
    }
    : {};
  const confirmPasswordInvalidProps = confirmPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "reset-password-confirm-error",
    }
    : {};

  return (
    <PublicAuthLayout
      badge="Tetapan Semula Kata Laluan"
      title="Cipta Kata Laluan Baharu"
      description="Gunakan pautan selamat yang dihantar ke emel anda untuk menetapkan kata laluan baharu dan mendapatkan semula akses ke sistem."
      contentBusy={loading || phase === "validating"}
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200" role="status" aria-live="polite">
          Sedang mengesahkan pautan tetapan semula anda...
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
          {error || "Pautan tetapan semula tidak sah atau telah tamat tempoh."}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100" role="status" aria-live="polite">
          Tetapan semula kata laluan berjaya. Anda kini boleh log masuk menggunakan username dan
          kata laluan baharu.
        </div>
      ) : null}

      {phase === "ready" && reset ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-200">
            <div><span className="font-semibold text-white">Username:</span> {reset.username}</div>
            <div><span className="font-semibold text-white">Peranan:</span> {reset.role}</div>
            <div><span className="font-semibold text-white">Tamat Tempoh:</span> {formatPublicAuthExpiry(reset.expiresAt)}</div>
          </div>
          <PublicAuthInput
            id="reset-password-new-password"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setNewPasswordError("");
              setError("");
            }}
            placeholder="Kata laluan baharu"
            autoComplete="new-password"
            disabled={loading}
            {...newPasswordInvalidProps}
          />
          {newPasswordError ? (
            <p id="reset-password-new-error" className="text-sm text-amber-100" role="alert">
              {newPasswordError}
            </p>
          ) : null}
          <PublicAuthInput
            id="reset-password-confirm-password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmPasswordError("");
              setError("");
            }}
            placeholder="Sahkan kata laluan baharu"
            autoComplete="new-password"
            disabled={loading}
            {...confirmPasswordInvalidProps}
          />
          {confirmPasswordError ? (
            <p id="reset-password-confirm-error" className="text-sm text-amber-100" role="alert">
              {confirmPasswordError}
            </p>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
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
