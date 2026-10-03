import { useEffect, useRef } from "react";
import { KeyRound, ShieldOff } from "lucide-react";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps, getAriaInvalidProps } from "@/lib/aria-state-props";
import { canConfigureTwoFactor } from "@/pages/settings/settings-my-account-utils";
import { TwoFactorSettingsPanel, type TwoFactorSettingsPanelProps } from "@/pages/settings/TwoFactorSettingsPanel";

export type PersonalSecurityFormProps = Omit<TwoFactorSettingsPanelProps, "busy"> & {
  currentUserRole: string;
  currentPasswordInput: string;
  currentPasswordError: string | null;
  newPasswordInput: string;
  newPasswordError: string | null;
  confirmPasswordInput: string;
  confirmPasswordError: string | null;
  passwordActionError?: string | null | undefined;
  passwordSaving: boolean;
  passwordExpanded: boolean;
  onPasswordExpandedChange: (open: boolean) => void;
  onChangePassword: () => void;
  onClearPassword: () => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onCurrentPasswordBlur: () => void;
  onNewPasswordInputChange: (value: string) => void;
  onNewPasswordBlur: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onConfirmPasswordBlur: () => void;
};

export function PersonalSecurityForm(props: PersonalSecurityFormProps) {
  const busy = props.passwordSaving || props.twoFactorLoading;
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const passwordTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmationId = "my-account-confirm-password-error";

  useEffect(() => {
    if (props.passwordExpanded) currentPasswordRef.current?.focus({ preventScroll: true });
  }, [props.passwordExpanded]);
  useEffect(() => {
    if (busy || !props.passwordExpanded) return;
    if (props.currentPasswordError) currentPasswordRef.current?.focus({ preventScroll: true });
    else if (props.newPasswordError) newPasswordRef.current?.focus({ preventScroll: true });
    else if (props.confirmPasswordError) confirmationRef.current?.focus({ preventScroll: true });
  }, [busy, props.confirmPasswordError, props.currentPasswordError, props.newPasswordError, props.passwordExpanded]);

  function closePasswordForm() {
    if (busy) return;
    props.onClearPassword();
    props.onPasswordExpandedChange(false);
    passwordTriggerRef.current?.focus({ preventScroll: true });
  }

  return <div className="personal-security-sections">
    <section className="personal-section" aria-labelledby="security-password-heading">
      <div className="flex min-w-0 flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 space-y-1">
          <h2 id="security-password-heading" className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />Password</h2>
          <p className="text-sm leading-6 text-muted-foreground">Keep your account protected with a strong password.</p>
        </div>
        <Button ref={passwordTriggerRef} type="button" variant="outline" className="min-h-11 w-full shrink-0 sm:w-auto"
          data-testid="security-change-password" disabled={busy}
          {...getAriaExpandedProps(props.passwordExpanded)} aria-controls="personal-password-form"
          onClick={() => props.passwordExpanded ? closePasswordForm() : props.onPasswordExpandedChange(true)}>Change password</Button>
      </div>
      {props.passwordExpanded ? <form id="personal-password-form" className="mt-5 min-w-0 space-y-4" noValidate
        aria-label="Change password" onSubmit={(event) => { event.preventDefault(); props.onChangePassword(); }}>
        <p className="text-sm leading-6 text-muted-foreground">Masukkan kata laluan semasa, kemudian tetapkan dan sahkan kata laluan baharu. Anda perlu log masuk semula selepas pertukaran.</p>
        <div className="space-y-2">
          <label htmlFor="my-account-current-password" className="text-sm font-medium">Kata laluan semasa</label>
          <PasswordInput ref={currentPasswordRef} id="my-account-current-password" name="currentPassword" visibilityLabel="kata laluan semasa"
            value={props.currentPasswordInput} onChange={(event) => props.onCurrentPasswordInputChange(event.target.value)}
            onBlur={props.onCurrentPasswordBlur} disabled={busy} autoComplete="current-password" className="min-h-11"
            {...getAriaInvalidProps(Boolean(props.currentPasswordError))}
            aria-describedby={props.currentPasswordError ? "my-account-current-password-error" : undefined} />
          {props.currentPasswordError ? <p id="my-account-current-password-error" className="text-sm text-destructive" role="alert">{props.currentPasswordError}</p> : null}
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <label htmlFor="my-account-new-password" className="text-sm font-medium">Kata laluan baharu</label>
            <PasswordInput ref={newPasswordRef} id="my-account-new-password" name="newPassword" visibilityLabel="kata laluan baharu"
              value={props.newPasswordInput} onChange={(event) => props.onNewPasswordInputChange(event.target.value)}
              onBlur={props.onNewPasswordBlur} disabled={busy} autoComplete="new-password" className="min-h-11"
              {...getAriaInvalidProps(Boolean(props.newPasswordError))}
              aria-describedby={["my-account-password-policy", props.newPasswordError ? "my-account-new-password-error" : null].filter(Boolean).join(" ")} />
            {props.newPasswordError ? <p id="my-account-new-password-error" className="text-sm text-destructive" role="alert">{props.newPasswordError}</p> : null}
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="my-account-confirm-password" className="text-sm font-medium">Sahkan kata laluan baharu</label>
            <PasswordInput ref={confirmationRef} id="my-account-confirm-password" name="confirmPassword" visibilityLabel="pengesahan kata laluan baharu"
              value={props.confirmPasswordInput} onChange={(event) => props.onConfirmPasswordInputChange(event.target.value)}
              onBlur={props.onConfirmPasswordBlur} disabled={busy} autoComplete="new-password" className="min-h-11"
              {...getAriaInvalidProps(Boolean(props.confirmPasswordInput ? props.newPasswordInput !== props.confirmPasswordInput : props.confirmPasswordError))}
              aria-describedby={confirmationId} />
            <PasswordConfirmationFeedback id={confirmationId} password={props.newPasswordInput} confirmation={props.confirmPasswordInput} requiredError={props.confirmPasswordError} />
          </div>
        </div>
        <PasswordStrengthMeter id="my-account-password-policy" password={props.newPasswordInput} />
        {props.passwordActionError ? <p role="alert" className="text-sm text-destructive">{props.passwordActionError}</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-floating-ai-avoid="true">
          <Button type="button" variant="outline" onClick={closePasswordForm} disabled={busy} className="min-h-11">Cancel</Button>
          <Button type="submit" disabled={busy} className="min-h-11">{props.passwordSaving ? "Mengemas kini..." : "Tukar kata laluan"}</Button>
        </div>
      </form> : null}
    </section>
    {canConfigureTwoFactor(props.currentUserRole) ? <TwoFactorSettingsPanel {...props} busy={busy} />
      : <section className="personal-section space-y-3" aria-labelledby="two-factor-heading" data-testid="two-factor-unavailable">
        <h2 id="two-factor-heading" className="flex items-center gap-2 text-base font-semibold"><ShieldOff className="h-4 w-4 shrink-0" aria-hidden="true" />Two-factor authentication</h2>
        <p className="text-sm leading-6">Status: {props.twoFactorEnabled ? "Enabled" : props.twoFactorPendingSetup ? "Setup pending" : "Disabled"}</p>
        <p className="text-sm leading-6 text-muted-foreground">Self-service 2FA is not available for this role under the current security policy. Contact your administrator for help.</p>
      </section>}
  </div>;
}
