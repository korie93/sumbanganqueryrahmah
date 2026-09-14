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

function displayDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("ms-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function TwoFactorSettingsPanel(props: TwoFactorSettingsPanelProps) {
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
  const activeDate = displayDate(props.twoFactorConfiguredAt);
  const expiryDate = displayDate(props.twoFactorSetupExpiresAt);
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
      if (setupIdentityRef.current === setupIdentity) setCopyNotice("Kunci disalin. Jangan kongsi kunci ini.");
    } catch {
      if (setupIdentityRef.current === setupIdentity) setCopyNotice("Tidak dapat menyalin secara automatik. Pilih dan salin kunci secara manual.");
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
  }

  const passwordField = <div className="space-y-2">
    <label htmlFor="my-account-two-factor-password" className="text-sm font-medium">Kata laluan semasa</label>
    <PasswordInput ref={passwordRef} id="my-account-two-factor-password" name="twoFactorCurrentPassword"
      visibilityLabel="kata laluan semasa untuk 2FA" value={props.twoFactorPasswordInput}
      onChange={(event) => props.onTwoFactorPasswordInputChange(event.target.value)} onBlur={props.onTwoFactorPasswordBlur}
      disabled={props.busy} autoComplete="current-password" className="min-h-11"
      {...getAriaInvalidProps(Boolean(props.twoFactorPasswordError))}
      aria-describedby={props.twoFactorPasswordError ? passwordErrorId : undefined} />
    {props.twoFactorPasswordError ? <p id={passwordErrorId} className="text-sm text-destructive" role="alert">{props.twoFactorPasswordError}</p> : null}
  </div>;

  const codeField = <div className="space-y-2">
    <label htmlFor="my-account-two-factor-code" className="text-sm font-medium">Kod pengesah 6 digit</label>
    <Input ref={codeRef} id="my-account-two-factor-code" name="twoFactorAuthenticatorCode" inputMode="numeric"
      autoComplete="one-time-code" pattern="[0-9]*" placeholder="000000" value={props.twoFactorCodeInput}
      onChange={(event) => props.onTwoFactorCodeInputChange(event.target.value)} onBlur={props.onTwoFactorCodeBlur}
      disabled={props.busy} className="min-h-12 max-w-xs text-center font-mono text-xl tracking-widest"
      {...getAriaInvalidProps(Boolean(props.twoFactorCodeError))}
      aria-describedby={["my-account-two-factor-code-help", props.twoFactorCodeError ? codeErrorId : null].filter(Boolean).join(" ")} />
    <p id="my-account-two-factor-code-help" className="text-sm leading-6 text-muted-foreground">Buka aplikasi pengesah dan masukkan kod terkini untuk akaun SQR anda. Kod berubah setiap 30 saat.</p>
    {props.twoFactorCodeError ? <p id={codeErrorId} className="text-sm text-destructive" role="alert">{props.twoFactorCodeError}</p> : null}
  </div>;

  return <section className="min-w-0 space-y-5 rounded-xl border border-border bg-background p-4 sm:p-5" aria-labelledby="two-factor-heading" data-testid="two-factor-settings" data-two-factor-state={props.twoFactorEnabled ? "active" : hasSetup ? "setup" : "off"}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {props.twoFactorEnabled ? <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ShieldOff className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <h3 id="two-factor-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold">Pengesahan Dua Faktor</h3>
      </div>
      <Badge variant="outline" className={props.twoFactorEnabled ? "border-green-700 text-green-700 dark:border-green-300 dark:text-green-200" : ""}>
        {props.twoFactorEnabled ? <Check className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
        Status: {props.twoFactorEnabled ? "Aktif" : "Tidak aktif"}
      </Badge>
    </div>
    {props.twoFactorActionError ? <p className="rounded-lg border border-destructive/40 p-3 text-sm leading-6 text-destructive" role="alert">{props.twoFactorActionError}</p> : null}

    {props.twoFactorEnabled ? <div className="space-y-4">
      <p className="text-sm leading-6">Akaun anda dilindungi dengan aplikasi pengesah. Kod 6 digit diperlukan selepas kata laluan semasa log masuk.</p>
      <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Kaedah</dt><dd className="font-medium">Aplikasi pengesah (TOTP)</dd></div>
        {activeDate ? <div><dt className="text-muted-foreground">Diaktifkan pada</dt><dd>{activeDate}</dd></div> : null}</dl>
      <p className="text-sm leading-6 text-muted-foreground">Simpan akses kepada aplikasi pengesah anda. Jika telefon hilang atau aplikasi tidak dapat diakses, hubungi pentadbir sistem.</p>
      {!disableStep ? <Button type="button" variant="outline" disabled={props.busy} onClick={() => setDisableStep(true)} className="min-h-11 w-full sm:w-auto">Nyahaktifkan 2FA</Button>
        : <form className="space-y-4 rounded-lg border border-border p-3 sm:p-4" noValidate onSubmit={(event) => { event.preventDefault(); props.onDisableTwoFactor(); }}>
          <h4 className="font-semibold">Sahkan nyahaktifkan 2FA</h4>
          <p className="text-sm leading-6 text-muted-foreground">Perlindungan tambahan akan dihentikan. Sahkan dengan kata laluan semasa dan kod aplikasi pengesah.</p>
          {passwordField}{codeField}
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" variant="destructive" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? "Menyahaktifkan..." : "Sahkan nyahaktifkan"}</Button><Button type="button" variant="outline" onClick={cancel} disabled={props.busy} className="min-h-11">Batal</Button></div>
        </form>}
    </div> : <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Lindungi akaun anda dengan langkah pengesahan tambahan melalui aplikasi pengesah. Kod ini bukan dihantar melalui emel atau SMS.</p>
      {visibleStep ? <div className="space-y-2" aria-label="Kemajuan persediaan 2FA">
        <p className="text-sm font-medium" role="status">Langkah {visibleStep} daripada 3 — {visibleStep === 1 ? "Sahkan identiti" : visibleStep === 2 ? "Tambah dalam aplikasi" : "Sahkan kod"}</p>
        <div className="flex gap-2" aria-hidden="true">{[1, 2, 3].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full ${step <= visibleStep ? "bg-primary" : "bg-muted"}`} />)}</div>
      </div> : null}
      {!hasSetup ? <>
        {props.twoFactorPendingSetup ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6">Persediaan sebelum ini belum selesai. Mulakan semula untuk mendapatkan kod QR baharu; gantikan entri SQR lama dalam aplikasi pengesah.</p> : null}
        {props.twoFactorSetupSecret && !setupParameters ? <p role="alert" className="text-sm text-destructive">Tetapan aplikasi tidak lengkap. Mulakan semula persediaan.</p> : null}
        {!passwordStep ? <Button type="button" onClick={() => setPasswordStep(true)} disabled={props.busy} className="min-h-11 w-full sm:w-auto"><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />{props.twoFactorPendingSetup ? "Mulakan semula persediaan" : "Aktifkan 2FA"}</Button>
          : <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); props.onStartTwoFactorSetup(); }}>
            <p className="text-sm leading-6">Sediakan aplikasi pengesah pada telefon anda, contohnya Ente Auth. Sahkan kata laluan untuk mendapatkan kod QR.</p>
            {passwordField}
            <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? "Menyediakan..." : "Teruskan ke kod QR"}</Button><Button type="button" variant="outline" onClick={cancel} disabled={props.busy} className="min-h-11">Batal</Button></div>
          </form>}
      </> : <>
        {expiryDate ? <p className="text-sm leading-6 text-muted-foreground">Selesaikan sebelum {expiryDate}. Jika tamat tempoh, mulakan semula persediaan.</p> : null}
        {!confirmStep ? <div className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6"><li>Buka aplikasi pengesah, contohnya Ente Auth, pada telefon anda.</li><li>Pilih tambah akaun, kemudian imbas kod QR di bawah.</li><li>Pastikan akaun <strong className="break-all">{props.twoFactorSetupIssuer}: {props.twoFactorSetupAccountName}</strong> muncul dalam aplikasi.</li></ol>
          <div className="-mx-3 flex justify-center rounded-lg border border-border bg-white sm:mx-0 sm:p-2" data-testid="two-factor-qr">
            <QRCodeSVG value={props.twoFactorSetupUri} size={240} marginSize={4} level="M" bgColor="#ffffff" fgColor="#000000" title="Imbas kod QR SQR dengan aplikasi pengesah" className="h-auto max-w-full" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">Jangan kongsi kod QR atau kunci persediaan ini. Pastikan masa telefon ditetapkan secara automatik.</p>
          <p className="text-sm leading-6 text-muted-foreground">Kod QR menetapkan {setupParameters?.algorithm}, 6 digit dan 30 saat. Jika aplikasi anda tidak menyokongnya, gunakan aplikasi serasi seperti Ente Auth.</p>
          <Button type="button" variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-left sm:w-auto" {...getAriaExpandedProps(manualVisible)} aria-controls="two-factor-manual-setup" onClick={() => { setManualVisible(!manualVisible); setCopyNotice(""); }} disabled={props.busy}><KeyRound className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />{manualVisible ? "Sembunyikan kunci persediaan" : "Tak dapat imbas kod QR? Papar kunci persediaan"}</Button>
          {manualVisible ? <div id="two-factor-manual-setup" className="min-w-0 space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm leading-6">Pilih tambah kunci persediaan secara manual. Gunakan nama akaun di atas dan tetapan tepat ini: <strong>TOTP, {setupParameters?.algorithm}, 6 digit, 30 saat.</strong> Jika aplikasi tidak menyokong algoritma ini secara manual, gunakan imbasan QR atau aplikasi serasi. Jangan tukar algoritma.</p>
            <label htmlFor="my-account-two-factor-secret" className="block text-sm font-medium">Kunci persediaan</label>
            <Input id="my-account-two-factor-secret" value={props.twoFactorSetupSecret} readOnly autoComplete="off" spellCheck={false} className="min-h-11 font-mono" />
            <Button type="button" variant="outline" onClick={() => void copyKey()} disabled={props.busy} className="min-h-11"><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Salin kunci</Button>
            <p className="text-sm" role="status">{copyNotice}</p>
          </div> : null}
          <Button type="button" onClick={() => setConfirmStep(true)} disabled={props.busy} className="min-h-11 w-full sm:w-auto"><Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />Saya sudah tambah akaun</Button>
        </div> : <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); props.onEnableTwoFactor(); }}>
          {codeField}<p className="text-sm leading-6 text-muted-foreground">2FA hanya diaktifkan selepas kod anda berjaya disahkan.</p>
          <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" disabled={props.busy} className="min-h-11">{props.twoFactorLoading ? "Mengesahkan..." : "Sahkan dan aktifkan 2FA"}</Button><Button type="button" variant="outline" disabled={props.busy} onClick={() => setConfirmStep(false)} className="min-h-11"><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />Kembali ke kod QR</Button></div>
        </form>}
        <Button type="button" variant="ghost" disabled={props.busy} onClick={cancel} className="min-h-11 w-full sm:w-auto">Batalkan persediaan</Button>
      </>}
    </div>}
  </section>;
}
