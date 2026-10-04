import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Copy, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PasswordInput } from "@/components/PasswordInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAriaExpandedProps, getAriaInvalidProps } from "@/lib/aria-state-props";
import { getAuthenticatorSetupParameters } from "@/lib/auth-flow-feedback";

export type TwoFactorSettingsPanelProps = {
  locale?: "ms" | "en";
  busy: boolean;
  twoFactorEnabled: boolean;
  twoFactorPendingSetup: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordInput: string;
  twoFactorPasswordError: string | null;
  twoFactorCodeInput: string;
  twoFactorCodeError: string | null;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupExpiresAt?: string | null | undefined;
  twoFactorConfiguredAt?: string | null | undefined;
  twoFactorActionError?: string | null | undefined;
  onClearTwoFactorSetup?: (() => void) | undefined;
  onStartTwoFactorSetup: () => void;
  onEnableTwoFactor: () => void;
  onDisableTwoFactor: () => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onTwoFactorPasswordBlur: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorCodeBlur: () => void;
};

function displayDate(value: string | null | undefined, locale: "ms" | "en") {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ms-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function TwoFactorSettingsPanel(props: TwoFactorSettingsPanelProps) {
  const locale = props.locale ?? "ms";
  const t = (ms: string, en: string) => locale === "en" ? en : ms;
  const [passwordStep, setPasswordStep] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [disableStep, setDisableStep] = useState(false);
  const [manualVisible, setManualVisible] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const setupParameters = getAuthenticatorSetupParameters(props.twoFactorSetupUri);
  const hasSetup = Boolean(props.twoFactorSetupSecret && props.twoFactorSetupUri && setupParameters && !props.twoFactorEnabled);
  const activeDate = displayDate(props.twoFactorConfiguredAt, locale);
  const expiryDate = displayDate(props.twoFactorSetupExpiresAt, locale);
  const visibleStep = hasSetup ? (confirmStep ? 3 : 2) : passwordStep ? 1 : 0;
  const codeErrorId = "my-account-two-factor-code-error";
  const passwordErrorId = "my-account-two-factor-password-error";
  const setupIdentityRef = useRef(props.twoFactorSetupUri);
  setupIdentityRef.current = props.twoFactorSetupUri;

  useEffect(() => {
    setConfirmStep(false);
    setManualVisible(false);
    setCopyNotice("");
    if (props.twoFactorSetupUri) {
      setPasswordStep(false);
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [props.twoFactorSetupUri]);

  useEffect(() => {
    setDisableStep(false);
    setPasswordStep(false);
    setManualVisible(false);
  }, [props.twoFactorEnabled]);

  useEffect(() => {
    if (props.busy) return;
    if (props.twoFactorPasswordError) passwordRef.current?.focus({ preventScroll: true });
    else if (props.twoFactorCodeError) codeRef.current?.focus({ preventScroll: true });
  }, [props.busy, props.twoFactorCodeError, props.twoFactorPasswordError]);

  useEffect(() => {
    if (confirmStep) codeRef.current?.focus();
    else if (passwordStep || disableStep) passwordRef.current?.focus();
  }, [confirmStep, disableStep, passwordStep]);

  async function copyKey() {
    const setupIdentity = props.twoFactorSetupUri;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(props.twoFactorSetupSecret);
      if (setupIdentityRef.current === setupIdentity) setCopyNotice(t("Kunci disalin. Jangan kongsi kunci ini.", "Key copied. Do not share this key."));
    } catch {
      if (setupIdentityRef.current === setupIdentity) setCopyNotice(t("Tidak dapat menyalin secara automatik. Pilih dan salin kunci secara manual.", "Could not copy automatically. Select and copy the key manually."));
    }
  }

  function cancel() {
    if (props.busy) return;
    props.onClearTwoFactorSetup?.();
    props.onTwoFactorPasswordInputChange("");
    props.onTwoFactorCodeInputChange("");
    setPasswordStep(false);
    setDisableStep(false);
    setConfirmStep(false);
    setManualVisible(false);
    setCopyNotice("");
    headingRef.current?.focus({ preventScroll: true });
  }

  const passwordField = <div className="space-y-2">
    <label htmlFor="my-account-two-factor-password" className="text-sm font-medium">{t("Kata laluan semasa", "Current password")}</label>
    <PasswordInput ref={passwordRef} id="my-account-two-factor-password" name="twoFactorCurrentPassword"
      visibilityLabel={t("kata laluan semasa untuk 2FA", "current password for 2FA")} locale={locale} capsLockMessage={t("Caps Lock aktif.", "Caps Lock is on.")} value={props.twoFactorPasswordInput}
      onChange={(event) => props.onTwoFactorPasswordInputChange(event.target.value)} onBlur={props.onTwoFactorPasswordBlur}
      disabled={props.busy} autoComplete="current-password" className="min-h-11"
      {...getAriaInvalidProps(Boolean(props.twoFactorPasswordError))}
      aria-describedby={props.twoFactorPasswordError ? passwordErrorId : undefined} />
    {props.twoFactorPasswordError ? <p id={passwordErrorId} className="text-sm text-destructive" role="alert">{props.twoFactorPasswordError}</p> : null}
  </div>;

  const codeField = <div className="space-y-2">
    <label htmlFor="my-account-two-factor-code" className="text-sm font-medium">{t("Kod pengesah 6 digit", "6-digit authenticator code")}</label>
    <Input ref={codeRef} id="my-account-two-factor-code" name="twoFactorAuthenticatorCode" inputMode="numeric"
      autoComplete="one-time-code" pattern="[0-9]*" placeholder="000000" value={props.twoFactorCodeInput}
      onChange={(event) => props.onTwoFactorCodeInputChange(event.target.value)} onBlur={props.onTwoFactorCodeBlur}
      disabled={props.busy} className="min-h-12 max-w-xs text-center font-mono text-xl tracking-widest"
      {...getAriaInvalidProps(Boolean(props.twoFactorCodeError))}
      aria-describedby={["my-account-two-factor-code-help", props.twoFactorCodeError ? codeErrorId : null].filter(Boolean).join(" ")} />
    <p id="my-account-two-factor-code-help" className="text-sm leading-6 text-muted-foreground">{t("Buka aplikasi pengesah dan masukkan kod terkini untuk akaun SQR anda. Kod berubah setiap 30 saat.", "Open your authenticator app and enter the latest code for your SQR account. Codes change every 30 seconds.")}</p>
    {props.twoFactorCodeError ? <p id={codeErrorId} className="text-sm text-destructive" role="alert">{props.twoFactorCodeError}</p> : null}
  </div>;

  return <section className="personal-section min-w-0 space-y-5" aria-labelledby="two-factor-heading" data-testid="two-factor-settings" data-two-factor-state={props.twoFactorEnabled ? "active" : hasSetup ? "setup" : "off"}
    onKeyDown={(event) => { if (event.key === "Escape" && (passwordStep || disableStep || hasSetup)) { event.preventDefault(); cancel(); } }}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {props.twoFactorEnabled ? <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ShieldOff className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <h2 id="two-factor-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold">{t("Pengesahan Dua Faktor", "Two-factor authentication")}</h2>
      </div>
      <Badge variant="outline" className={props.twoFactorEnabled ? "border-green-700 text-green-700 dark:border-green-300 dark:text-green-200" : ""}>
        {props.twoFactorEnabled ? <Check className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
        Status: {props.twoFactorEnabled ? t("Aktif", "Enabled") : t("Tidak aktif", "Not enabled")}
      </Badge>
    </div>
    {props.twoFactorActionError ? <p className="rounded-lg border border-destructive/40 p-3 text-sm leading-6 text-destructive" role="alert">{props.twoFactorActionError}</p> : null}

    {props.twoFactorEnabled ? <div className="space-y-4">
      <p className="text-sm leading-6">{t("Akaun anda dilindungi dengan aplikasi pengesah. Kod 6 digit diperlukan selepas kata laluan semasa log masuk.", "Your authenticator is enabled. A 6-digit code is required after your password when you sign in.")}</p>
      <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">{t("Kaedah", "Method")}</dt><dd className="font-medium">{t("Aplikasi pengesah (TOTP)", "Authenticator app (TOTP)")}</dd></div>
        {activeDate ? <div><dt className="text-muted-foreground">{t("Diaktifkan pada", "Enabled on")}</dt><dd>{activeDate}</dd></div> : null}</dl>
      <p className="text-sm leading-6 text-muted-foreground">{t("Simpan akses kepada aplikasi pengesah anda. Jika telefon hilang atau aplikasi tidak dapat diakses, hubungi pentadbir sistem.", "Keep access to your authenticator app. If your phone is lost or you cannot access the app, contact your system administrator.")}</p>
      {!disableStep ? <Button type="button" variant="outline" disabled={props.busy} onClick={() => setDisableStep(true)} className="min-h-11 w-full sm:w-auto">{t("Nyahaktifkan 2FA", "Disable 2FA")}</Button>
        : <form className="space-y-4 rounded-lg border border-border p-3 sm:p-4" noValidate onSubmit={(event) => { event.preventDefault(); if (!props.busy) props.onDisableTwoFactor(); }}>
          <h3 className="font-semibold">{t("Sahkan nyahaktifkan 2FA", "Confirm disabling 2FA")}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{t("Perlindungan tambahan akan dihentikan. Sahkan dengan kata laluan semasa dan kod aplikasi pengesah.", "This removes the additional verification step. Confirm with your current password and authenticator code.")}</p>
          {passwordField}{codeField}
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" variant="destructive" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? t("Menyahaktifkan...", "Disabling...") : t("Sahkan nyahaktifkan", "Confirm disable")}</Button><Button type="button" variant="outline" onClick={cancel} disabled={props.busy} className="min-h-11">{t("Batal", "Cancel")}</Button></div>
        </form>}
    </div> : <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{t("Lindungi akaun anda dengan langkah pengesahan tambahan melalui aplikasi pengesah. Kod ini bukan dihantar melalui emel atau SMS.", "Add another verification step with an authenticator app. This code is not sent by email or SMS.")}</p>
      {visibleStep ? <div className="space-y-2" aria-label={t("Kemajuan persediaan 2FA", "Two-factor setup progress")}>
        <p className="text-sm font-medium" role="status">{t("Langkah", "Step")} {visibleStep} {t("daripada", "of")} 3 — {visibleStep === 1 ? t("Sahkan identiti", "Verify identity") : visibleStep === 2 ? t("Tambah dalam aplikasi", "Add to authenticator") : t("Sahkan kod", "Verify code")}</p>
        <div className="flex gap-2" aria-hidden="true">{[1, 2, 3].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full ${step <= visibleStep ? "bg-primary" : "bg-muted"}`} />)}</div>
      </div> : null}
      {!hasSetup ? <>
        {props.twoFactorPendingSetup ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6">{t("Persediaan sebelum ini belum selesai. Mulakan semula untuk mendapatkan kod QR baharu; gantikan entri SQR lama dalam aplikasi pengesah.", "Your previous setup is incomplete. Start again for a new QR code and replace the old SQR entry in your authenticator app.")}</p> : null}
        {props.twoFactorSetupSecret && !setupParameters ? <p role="alert" className="text-sm text-destructive">{t("Tetapan aplikasi tidak lengkap. Mulakan semula persediaan.", "Authenticator settings are incomplete. Start setup again.")}</p> : null}
        {!passwordStep ? <Button type="button" onClick={() => setPasswordStep(true)} disabled={props.busy} className="min-h-11 w-full sm:w-auto"><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />{props.twoFactorPendingSetup ? t("Mulakan semula persediaan", "Restart setup") : t("Aktifkan 2FA", "Activate 2FA")}</Button>
          : <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); if (!props.busy) props.onStartTwoFactorSetup(); }}>
            <p className="text-sm leading-6">{t("Sediakan aplikasi pengesah pada telefon anda, contohnya Ente Auth. Sahkan kata laluan untuk mendapatkan kod QR.", "Have an authenticator app ready on your phone, such as Ente Auth. Confirm your password to get the QR code.")}</p>
            {passwordField}
            <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? t("Menyediakan...", "Preparing...") : t("Teruskan ke kod QR", "Continue to QR code")}</Button><Button type="button" variant="outline" onClick={cancel} disabled={props.busy} className="min-h-11">{t("Batal", "Cancel")}</Button></div>
          </form>}
      </> : <>
        {expiryDate ? <p className="text-sm leading-6 text-muted-foreground">{t("Selesaikan sebelum", "Complete setup before")} {expiryDate}. {t("Jika tamat tempoh, mulakan semula persediaan.", "If it expires, start setup again.")}</p> : null}
        {!confirmStep ? <div className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6"><li>{t("Buka aplikasi pengesah, contohnya Ente Auth, pada telefon anda.", "Open an authenticator app, such as Ente Auth, on your phone.")}</li><li>{t("Pilih tambah akaun, kemudian imbas kod QR di bawah.", "Choose to add an account, then scan the QR code below.")}</li><li>{t("Pastikan akaun", "Check that the account")} <strong className="break-all">{props.twoFactorSetupIssuer}: {props.twoFactorSetupAccountName}</strong> {t("muncul dalam aplikasi.", "appears in the app.")}</li></ol>
          <div className="flex justify-center rounded-lg border border-border bg-white sm:p-2" data-testid="two-factor-qr">
            <QRCodeSVG value={props.twoFactorSetupUri} size={240} marginSize={4} level="M" bgColor="#ffffff" fgColor="#000000" title={t("Imbas kod QR SQR dengan aplikasi pengesah", "Scan the SQR QR code with your authenticator app")} className="h-auto max-w-full" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{t("Jangan kongsi kod QR atau kunci persediaan ini. Pastikan masa telefon ditetapkan secara automatik.", "Do not share this QR code or setup key. Make sure your phone's time is set automatically.")}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t("Kod QR menetapkan", "The QR code specifies")} {setupParameters?.algorithm}, {t("6 digit dan 30 saat. Jika aplikasi anda tidak menyokongnya, gunakan aplikasi serasi seperti Ente Auth.", "6 digits and 30 seconds. If your app does not support this, use a compatible app such as Ente Auth.")}</p>
          <Button type="button" variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-left sm:w-auto" {...getAriaExpandedProps(manualVisible)} aria-controls="two-factor-manual-setup" onClick={() => { setManualVisible(!manualVisible); setCopyNotice(""); }} disabled={props.busy}><KeyRound className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />{manualVisible ? t("Sembunyikan kunci persediaan", "Hide setup key") : t("Tak dapat imbas kod QR? Papar kunci persediaan", "Can't scan the QR code? Show setup key")}</Button>
          {manualVisible ? <div id="two-factor-manual-setup" className="min-w-0 space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm leading-6">{t("Pilih tambah kunci persediaan secara manual. Gunakan nama akaun di atas dan tetapan tepat ini:", "Choose manual setup. Use the account name above and these exact settings:")} <strong>TOTP, {setupParameters?.algorithm}, {t("6 digit, 30 saat.", "6 digits, 30 seconds.")}</strong> {t("Jika aplikasi tidak menyokong algoritma ini secara manual, gunakan imbasan QR atau aplikasi serasi. Jangan tukar algoritma.", "If your app cannot set this algorithm manually, scan the QR code or use a compatible app. Do not change the algorithm.")}</p>
            <label htmlFor="my-account-two-factor-secret" className="block text-sm font-medium">{t("Kunci persediaan", "Setup key")}</label>
            <Input id="my-account-two-factor-secret" value={props.twoFactorSetupSecret} readOnly autoComplete="off" spellCheck={false} className="min-h-11 font-mono" />
            <Button type="button" variant="outline" onClick={() => void copyKey()} disabled={props.busy} className="min-h-11"><Copy className="mr-2 h-4 w-4" aria-hidden="true" />{t("Salin kunci", "Copy key")}</Button>
            <p className="text-sm" role="status">{copyNotice}</p>
          </div> : null}
          <Button type="button" onClick={() => setConfirmStep(true)} disabled={props.busy} className="min-h-11 w-full sm:w-auto"><Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />{t("Saya sudah tambah akaun", "I have added the account")}</Button>
        </div> : <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); if (!props.busy) props.onEnableTwoFactor(); }}>
          {codeField}<p className="text-sm leading-6 text-muted-foreground">{t("2FA hanya diaktifkan selepas kod anda berjaya disahkan.", "2FA is enabled only after your code is successfully verified.")}</p>
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? t("Mengesahkan...", "Verifying...") : t("Sahkan dan aktifkan 2FA", "Verify and enable 2FA")}</Button><Button type="button" variant="outline" disabled={props.busy} onClick={() => setConfirmStep(false)} className="min-h-11"><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />{t("Kembali ke kod QR", "Back to QR code")}</Button></div>
        </form>}
        <Button type="button" variant="ghost" disabled={props.busy} onClick={cancel} className="min-h-11 w-full sm:w-auto">{t("Batalkan persediaan", "Cancel setup")}</Button>
      </>}
    </div>}
  </section>;
}
