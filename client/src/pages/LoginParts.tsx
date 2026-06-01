import { Eye, EyeOff, LogIn } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ExpandableMessage } from "@/components/ExpandableMessage";

type LoginPasswordVisibilityButtonProps = {
  loading: boolean;
  showPassword: boolean;
  onToggle: () => void;
};

type LoginSubmitContentProps = {
  lockedFlow: boolean;
  loading: boolean;
  twoFactorChallengeToken: string | null;
};

type LoginLockedAlertProps = {
  lockedAccountMessage: string;
  lockedCountdownSeconds: number;
};

type LoginSecondaryActionsProps = {
  twoFactorChallengeToken: string | null;
  onForgotPassword: () => void;
  onReturnToPasswordLogin: () => void;
};

export function LoginAsidePanel() {
  return (
    <div className="login-card-aside" aria-hidden="true">
      <div className="login-aside-kicker">Akses SQR</div>
      <div className="login-aside-title">Log masuk pantas untuk operasi harian.</div>
      <div className="login-aside-copy">
        Satu pintu masuk yang ringkas, pantas, dan jelas untuk pasukan operasi.
      </div>
      <div className="login-aside-metrics">
        <span>2FA tersedia</span>
        <span>Sesi dilindungi</span>
      </div>
    </div>
  );
}

export function LoginBrandHeader() {
  return (
    <div className="login-brand mb-7 flex flex-col items-center">
      <div className="login-brand-mark mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg">
        <BrandLogo
          decorative
          priority
          className="block h-10 w-10"
          imageClassName="h-full w-full"
        />
      </div>
      <h1 className="login-title text-center text-2xl font-bold">
        Log Masuk SQR
      </h1>
      <p className="login-subtitle mt-2 text-center text-sm">
        Platform operasi dalaman Sumbangan Query Rahmah
      </p>
    </div>
  );
}

export function LoginFooter() {
  return (
    <div className="login-footer mt-7 text-center text-xs">
      Sumbangan Query Rahmah
    </div>
  );
}

export function LoginPasswordVisibilityButton({
  loading,
  showPassword,
  onToggle,
}: LoginPasswordVisibilityButtonProps) {
  const buttonClassName =
    "login-password-toggle absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl transition-colors";

  if (showPassword) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={loading}
        className={buttonClassName}
        data-testid="button-toggle-password"
        aria-label="Sembunyi kata laluan"
        aria-pressed="true"
        title="Sembunyi kata laluan"
      >
        <EyeOff className="h-5 w-5" aria-hidden="true" focusable="false" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={buttonClassName}
      data-testid="button-toggle-password"
      aria-label="Papar kata laluan"
      aria-pressed="false"
      title="Papar kata laluan"
    >
      <Eye className="h-5 w-5" aria-hidden="true" focusable="false" />
    </button>
  );
}

export function LoginSubmitContent({
  lockedFlow,
  loading,
  twoFactorChallengeToken,
}: LoginSubmitContentProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="login-submit-spinner h-5 w-5 animate-spin rounded-full border-2" aria-hidden="true" />
        {twoFactorChallengeToken ? "Mengesahkan..." : "Sedang log masuk..."}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <LogIn className="h-5 w-5" aria-hidden="true" focusable="false" />
      {lockedFlow ? "Akaun Dikunci" : twoFactorChallengeToken ? "Sahkan Kod" : "Log Masuk"}
    </div>
  );
}

export function LoginLockedAlert({
  lockedAccountMessage,
  lockedCountdownSeconds,
}: LoginLockedAlertProps) {
  return (
    <div className="login-alert login-alert--warning mt-4 text-sm" role="alert">
      <div className="font-medium">
        <ExpandableMessage>
          {lockedAccountMessage || "Akaun anda telah dikunci kerana terlalu banyak percubaan log masuk yang tidak sah."}
        </ExpandableMessage>
      </div>
      <div
        className="login-alert--warning-subtext mt-1 text-xs"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {lockedCountdownSeconds > 0
          ? `Sila cuba semula dalam ${lockedCountdownSeconds} saat.`
          : "Sila hubungi pentadbir sistem untuk pengaktifan semula akaun."}
      </div>
    </div>
  );
}

export function LoginSecondaryActions({
  twoFactorChallengeToken,
  onForgotPassword,
  onReturnToPasswordLogin,
}: LoginSecondaryActionsProps) {
  return (
    <>
      {twoFactorChallengeToken ? (
        <button
          type="button"
          onClick={onReturnToPasswordLogin}
          className="login-secondary-link mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm transition-colors"
        >
          Kembali ke log masuk kata laluan
        </button>
      ) : null}

      <button
        type="button"
        onClick={onForgotPassword}
        className="login-secondary-link mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-center text-sm transition-colors"
      >
        Lupa kata laluan?
      </button>
    </>
  );
}
