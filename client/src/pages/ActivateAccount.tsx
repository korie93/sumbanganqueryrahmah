import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import {
  activateAccount,
  type ActivationTokenValidationPayload,
  validateActivationToken,
} from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { persistAuthNotice } from "@/lib/auth-session";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";

type ActivationPhase = "invalid" | "ready" | "success" | "validating";

const ACTIVATION_SUCCESS_REDIRECT_DELAY_MS = 1_200;

function getTokenFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token") || "";
}

function formatExpiry(value: string) {
  return formatDateTimeDDMMYYYY(value, { fallback: value });
}

export default function ActivateAccountPage() {
  const token = useMemo(() => getTokenFromLocation(), []);
  const [activation, setActivation] = useState<ActivationTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ActivationPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan aktivasi tidak sah.");
  const mountedRef = useRef(true);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const activationAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      validationAbortControllerRef.current?.abort();
      validationAbortControllerRef.current = null;
      activationAbortControllerRef.current?.abort();
      activationAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "success" || !activation) return;

    persistAuthNotice(
      `Akaun untuk ${activation.username} telah sedia digunakan. Sila log masuk menggunakan kata laluan baharu anda.`,
    );

    const timeoutId = window.setTimeout(() => {
      window.location.href = "/";
    }, ACTIVATION_SUCCESS_REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activation, phase]);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setError("Pautan aktivasi tidak sah.");
      return undefined;
    }

    validationAbortControllerRef.current?.abort();
    const controller = new AbortController();
    validationAbortControllerRef.current = controller;

    const runValidation = async () => {
      setPhase("validating");
      setError("");

      try {
        const response = await validateActivationToken({ token }, {
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        setActivation(response.activation);
        setPhase("ready");
      } catch (validationError) {
        if (
          (validationError instanceof DOMException && validationError.name === "AbortError") ||
          !mountedRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        setActivation(null);
        setPhase("invalid");
        setError(getApiErrorMessage(validationError, "Pautan aktivasi tidak sah atau telah tamat tempoh."));
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

  const handleActivate = async () => {
    if (!activation || loading || phase !== "ready" || activationAbortControllerRef.current) return;

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
    activationAbortControllerRef.current = controller;

    try {
      await activateAccount({
        username: activation.username,
        token,
        newPassword,
        confirmPassword,
      }, {
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setPhase("success");
    } catch (activationError) {
      if (
        (activationError instanceof DOMException && activationError.name === "AbortError") ||
        !mountedRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setError(getApiErrorMessage(activationError, "Aktivasi akaun gagal."));
    } finally {
      if (activationAbortControllerRef.current === controller) {
        activationAbortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const onPasswordKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      void handleActivate();
    }
  };

  const newPasswordInvalidProps = newPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "activate-password-new-error",
    }
    : {};
  const confirmPasswordInvalidProps = confirmPasswordError
    ? {
      "aria-invalid": "true" as const,
      "aria-describedby": "activate-password-confirm-error",
    }
    : {};

  const title =
    phase === "success"
      ? "Kata Laluan Berjaya Dicipta"
      : phase === "ready"
        ? "Cipta Kata Laluan"
        : "Aktivasi Akaun";

  return (
    <PublicAuthLayout
      badge="Aktivasi Akaun"
      title={title}
      description="Lengkapkan persediaan akaun kali pertama menggunakan pautan aktivasi yang dihantar ke emel anda. Langkah ini diperlukan sebelum anda boleh mula menggunakan sistem."
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
          Sedang mengesahkan pautan aktivasi anda...
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
          {error || "Pautan aktivasi tidak sah atau telah tamat tempoh."}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm leading-7 text-emerald-100" role="status" aria-live="polite">
          Kata laluan berjaya dicipta. Anda akan dibawa semula ke halaman log masuk sebentar lagi.
        </div>
      ) : null}

      {phase === "ready" && activation ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-200">
            <div><span className="font-semibold text-white">Username:</span> {activation.username}</div>
            <div><span className="font-semibold text-white">Peranan:</span> {activation.role}</div>
            <div><span className="font-semibold text-white">Tamat Tempoh:</span> {formatExpiry(activation.expiresAt)}</div>
          </div>
          <PublicAuthInput
            id="activate-account-new-password"
            name="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setNewPasswordError("");
              setError("");
            }}
            onKeyDown={onPasswordKeyDown}
            placeholder="Kata laluan baharu"
            autoComplete="new-password"
            autoFocus
            disabled={loading}
            {...newPasswordInvalidProps}
          />
          {newPasswordError ? (
            <p id="activate-password-new-error" className="text-sm text-amber-100" role="alert">
              {newPasswordError}
            </p>
          ) : null}
          <PublicAuthInput
            id="activate-account-confirm-password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmPasswordError("");
              setError("");
            }}
            onKeyDown={onPasswordKeyDown}
            placeholder="Sahkan kata laluan baharu"
            autoComplete="new-password"
            disabled={loading}
            {...confirmPasswordInvalidProps}
          />
          {confirmPasswordError ? (
            <p id="activate-password-confirm-error" className="text-sm text-amber-100" role="alert">
              {confirmPasswordError}
            </p>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
              {error}
            </div>
          ) : null}
          <PublicAuthButton
            onClick={() => void handleActivate()}
            disabled={loading}
          >
            {loading ? "Sedang mencipta kata laluan..." : "Cipta Kata Laluan"}
          </PublicAuthButton>
        </>
      ) : null}

      {phase === "success" ? (
        <PublicAuthButton
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Buka Halaman Log Masuk
        </PublicAuthButton>
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
