import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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
  getPublicAuthTokenFromLocation,
  isPublicAuthAbortError,
} from "@/pages/public-auth-runtime-utils";
import {
  ActivateAccountIcon,
  ActivationActions,
  ActivationPasswordForm,
  ActivationStatusCard,
  type ActivationPhase,
} from "@/pages/ActivateAccountParts";

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

  const validateNewPasswordOnBlur = () => {
    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    setNewPasswordError(fieldErrors.newPassword ?? "");
    if (confirmPassword) {
      setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
    }
  };

  const validateConfirmPasswordOnBlur = () => {
    const fieldErrors = validatePasswordFields({
      newPassword,
      confirmPassword,
    });
    setConfirmPasswordError(fieldErrors.confirmPassword ?? "");
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
      icon={<ActivateAccountIcon phase={phase} />}
    >
      <ActivationStatusCard error={error} phase={phase} />

      {phase === "ready" && activation ? (
        <ActivationPasswordForm
          activation={activation}
          confirmPassword={confirmPassword}
          confirmPasswordError={confirmPasswordError}
          confirmPasswordInvalidProps={confirmPasswordInvalidProps}
          error={error}
          loading={loading}
          newPassword={newPassword}
          newPasswordError={newPasswordError}
          newPasswordInputRef={newPasswordInputRef}
          newPasswordInvalidProps={newPasswordInvalidProps}
          onActivate={() => void handleActivate()}
          onClearConfirmPasswordError={() => setConfirmPasswordError("")}
          onClearFormError={() => setError("")}
          onClearNewPasswordError={() => setNewPasswordError("")}
          onConfirmPasswordChange={setConfirmPassword}
          onConfirmPasswordBlur={validateConfirmPasswordOnBlur}
          onNewPasswordChange={setNewPassword}
          onNewPasswordBlur={validateNewPasswordOnBlur}
          onPasswordKeyDown={onPasswordKeyDown}
        />
      ) : null}

      <ActivationActions
        phase={phase}
        onBackToLogin={navigateToLogin}
      />
    </PublicAuthLayout>
  );
}
