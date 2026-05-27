import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, KeyRound, ShieldAlert } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { PublicAuthButton, PublicAuthInput } from "@/components/PublicAuthControls";
import { PublicAuthLayout } from "@/components/PublicAuthLayout";
import {
  activateAccount,
  type ActivationTokenValidationPayload,
  validateActivationToken,
} from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api-errors";
import { persistAuthNotice } from "@/lib/auth-session";
import { shouldAutoFocusPublicAuthField } from "@/lib/interaction-media";
import {
  hasPublicAuthFieldErrors,
  validatePasswordFields,
} from "@/pages/public-auth-form-utils";
import {
  formatPublicAuthExpiry,
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";

type ActivationPhase = "invalid" | "ready" | "success" | "validating";

const ACTIVATION_SUCCESS_REDIRECT_DELAY_MS = 1_200;

type ActivateAccountPageProps = {
  onBackToLogin?: () => void;
};

export default function ActivateAccountPage({ onBackToLogin }: ActivateAccountPageProps) {
  const [, navigate] = useLocation();
  const token = useMemo(() => getPublicAuthTokenFromLocation(), []);
  const [activation, setActivation] = useState<ActivationTokenValidationPayload | null>(null);
  const [phase, setPhase] = useState<ActivationPhase>(token ? "validating" : "invalid");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "Pautan aktivasi tidak sah.");
  const mountedRef = useRef(true);
  const newPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const validationAbortControllerRef = useRef<AbortController | null>(null);
  const activationAbortControllerRef = useRef<AbortController | null>(null);

  const navigateToLogin = useCallback(() => {
    if (onBackToLogin) {
      onBackToLogin();
      return;
    }

    navigate("/");
  }, [navigate, onBackToLogin]);

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
      navigateToLogin();
    }, ACTIVATION_SUCCESS_REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activation, navigateToLogin, phase]);

  useEffect(() => {
    if (
      phase !== "ready" ||
      !activation ||
      typeof window === "undefined" ||
      !shouldAutoFocusPublicAuthField()
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      newPasswordInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
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
          isPublicAuthAbortError(validationError) ||
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
        isPublicAuthAbortError(activationError) ||
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

  const newPasswordDescribedBy = [
    "activate-password-strength",
    newPasswordError ? "activate-password-new-error" : null,
  ].filter(Boolean).join(" ");
  const newPasswordInvalidProps = {
    "aria-describedby": newPasswordDescribedBy,
    ...(newPasswordError ? { "aria-invalid": "true" as const } : {}),
  };
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
      visualMode="minimal"
      showBackButton={false}
      backLabel="Kembali ke log masuk"
      onBackClick={navigateToLogin}
      icon={
        phase === "invalid" ? (
          <ShieldAlert className="h-7 w-7" aria-hidden="true" focusable="false" />
        ) : phase === "success" ? (
          <BadgeCheck className="h-7 w-7" aria-hidden="true" focusable="false" />
        ) : (
          <KeyRound className="h-7 w-7" aria-hidden="true" focusable="false" />
        )
      }
    >
      {phase === "validating" ? (
        <div className="public-auth-status-card public-auth-status-card--info" role="status" aria-live="polite">
          Sedang mengesahkan pautan aktivasi anda...
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="public-auth-status-card public-auth-status-card--error" role="alert">
          {error || "Pautan aktivasi tidak sah atau telah tamat tempoh."}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite">
          Kata laluan berjaya dicipta. Anda akan dibawa semula ke halaman log masuk sebentar lagi.
        </div>
      ) : null}

      {phase === "ready" && activation ? (
        <>
          <dl className="public-auth-account-summary">
            <div className="public-auth-account-summary__row">
              <dt>Nama pengguna</dt>
              <dd>{activation.username}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>Peranan</dt>
              <dd>{activation.role}</dd>
            </div>
            <div className="public-auth-account-summary__row">
              <dt>Tamat tempoh</dt>
              <dd>{formatPublicAuthExpiry(activation.expiresAt)}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <label htmlFor="activate-account-new-password" className="public-auth-field-label">
              Kata laluan baharu
            </label>
            <PublicAuthInput
              ref={newPasswordInputRef}
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
              placeholder="Masukkan kata laluan baharu"
              autoComplete="new-password"
              disabled={loading}
              {...newPasswordInvalidProps}
            />
          </div>
          <PasswordStrengthMeter
            id="activate-password-strength"
            password={newPassword}
          />
          {newPasswordError ? (
            <p id="activate-password-new-error" className="public-auth-field-error" role="alert">
              {newPasswordError}
            </p>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="activate-account-confirm-password" className="public-auth-field-label">
              Sahkan kata laluan baharu
            </label>
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
              placeholder="Masukkan semula kata laluan"
              autoComplete="new-password"
              disabled={loading}
              {...confirmPasswordInvalidProps}
            />
          </div>
          {confirmPasswordError ? (
            <p id="activate-password-confirm-error" className="public-auth-field-error" role="alert">
              {confirmPasswordError}
            </p>
          ) : null}
          {error ? (
            <div className="public-auth-status-card public-auth-status-card--error" role="alert">
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
            navigateToLogin();
          }}
        >
          Buka Halaman Log Masuk
        </PublicAuthButton>
      ) : null}

      <PublicAuthButton
        type="button"
        variant="ghost"
        onClick={() => {
          navigateToLogin();
        }}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
        Kembali ke log masuk
      </PublicAuthButton>
    </PublicAuthLayout>
  );
}
