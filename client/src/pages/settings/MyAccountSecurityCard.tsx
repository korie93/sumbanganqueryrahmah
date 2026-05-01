import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

interface MyAccountSecurityCardProps {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  newPasswordInput: string;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  usernameInput: string;
  usernameSaving: boolean;
}

export function MyAccountSecurityCard({
  confirmPasswordInput,
  currentPasswordInput,
  currentUserRole,
  newPasswordInput,
  onDisableTwoFactor,
  onEnableTwoFactor,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordInputChange,
  onCurrentPasswordInputChange,
  onNewPasswordInputChange,
  onStartTwoFactorSetup,
  onTwoFactorCodeInputChange,
  onTwoFactorPasswordInputChange,
  onUsernameInputChange,
  passwordSaving,
  twoFactorCodeInput,
  twoFactorEnabled,
  twoFactorLoading,
  twoFactorPasswordInput,
  twoFactorPendingSetup,
  twoFactorSetupAccountName,
  twoFactorSetupIssuer,
  twoFactorSetupSecret,
  twoFactorSetupUri,
  usernameInput,
  usernameSaving,
}: MyAccountSecurityCardProps) {
  const isMobile = useIsMobile();
  const supportsTwoFactor = currentUserRole === "admin" || currentUserRole === "superuser";
  const securityBusy = usernameSaving || passwordSaving || twoFactorLoading;
  const twoFactorStatus = twoFactorEnabled
    ? "Diaktifkan"
    : twoFactorPendingSetup
      ? "Persediaan belum selesai"
      : "Belum diaktifkan";
  const twoFactorStatusVariant = twoFactorEnabled
    ? "default"
    : twoFactorPendingSetup
      ? "secondary"
      : "outline";

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className={isMobile ? "space-y-4 pb-4" : undefined}>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <KeyRound className="h-5 w-5" />
          Keselamatan Akaun
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isMobile
            ? "Kemas kini identiti akaun, kata laluan, dan perlindungan dua faktor."
            : "Urus nama pengguna, kata laluan, dan perlindungan dua faktor untuk akaun ini."}
        </p>
        {isMobile ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Peranan {currentUserRole}
            </Badge>
            {supportsTwoFactor ? (
              <Badge
                variant={twoFactorStatusVariant}
                className="rounded-full px-3 py-1"
              >
                2FA: {twoFactorStatus}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={isMobile ? "pt-0" : undefined}>
        <Card className="border-border/60 bg-background/60">
          <CardHeader className={isMobile ? "pb-4" : undefined}>
            <CardTitle className="text-base">Akaun Saya</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Identiti</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Pastikan nama log masuk anda terkini tanpa meninggalkan halaman keselamatan.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <label htmlFor="my-account-username" className="text-sm font-medium">
                    Nama pengguna
                  </label>
                  <Input
                    id="my-account-username"
                    name="accountUsername"
                    value={usernameInput}
                    onChange={(event) => onUsernameInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  onClick={onChangeUsername}
                  disabled={securityBusy}
                  className="w-full md:w-auto"
                >
                  {usernameSaving ? "Mengemas kini..." : "Tukar nama pengguna"}
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="my-account-role" className="text-sm font-medium">
                  Peranan (baca sahaja)
                </label>
                <Input id="my-account-role" name="accountRole" value={currentUserRole} disabled />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Tukar kata laluan</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Masukkan kata laluan semasa sekali, kemudian tetapkan dan sahkan kata laluan baharu.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label htmlFor="my-account-current-password" className="text-sm font-medium">
                    Kata laluan semasa
                  </label>
                  <Input
                    id="my-account-current-password"
                    name="currentPassword"
                    type="password"
                    value={currentPasswordInput}
                    onChange={(event) => onCurrentPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-new-password" className="text-sm font-medium">
                    Kata laluan baharu
                  </label>
                  <Input
                    id="my-account-new-password"
                    name="newPassword"
                    type="password"
                    value={newPasswordInput}
                    onChange={(event) => onNewPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-confirm-password" className="text-sm font-medium">
                    Sahkan kata laluan
                  </label>
                  <Input
                    id="my-account-confirm-password"
                    name="confirmPassword"
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(event) => onConfirmPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-floating-ai-avoid="true">
                <Button onClick={onChangePassword} disabled={securityBusy} className="w-full sm:w-auto">
                  {passwordSaving ? "Mengemas kini..." : "Tukar kata laluan"}
                </Button>
              </div>
            </div>

            {supportsTwoFactor ? (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Pengesahan dua faktor</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={twoFactorStatusVariant}
                      className="rounded-full px-3 py-1"
                    >
                      {twoFactorStatus}
                    </Badge>
                    {twoFactorSetupSecret ? (
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        Rahsia persediaan sedia
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Gunakan aplikasi pengesah untuk melindungi akaun ini dengan langkah pengesahan kedua.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="my-account-two-factor-password" className="text-sm font-medium">
                      Kata laluan semasa
                    </label>
                    <Input
                      id="my-account-two-factor-password"
                      name="twoFactorCurrentPassword"
                      type="password"
                      value={twoFactorPasswordInput}
                      onChange={(event) => onTwoFactorPasswordInputChange(event.target.value)}
                      disabled={securityBusy}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="my-account-two-factor-code" className="text-sm font-medium">
                      Kod pengesah
                    </label>
                    <Input
                      id="my-account-two-factor-code"
                      name="twoFactorAuthenticatorCode"
                      inputMode="numeric"
                      placeholder="000000"
                      value={twoFactorCodeInput}
                      onChange={(event) => onTwoFactorCodeInputChange(event.target.value)}
                      disabled={securityBusy && !twoFactorPendingSetup}
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                    />
                  </div>
                </div>

                {twoFactorSetupSecret ? (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/55 p-4">
                    <p className="text-sm text-muted-foreground">
                      Tambahkan rahsia ini ke aplikasi pengesah, kemudian masukkan kod 6 digit untuk mengaktifkan 2FA.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-issuer" className="text-sm font-medium">
                          Pengeluar
                        </label>
                        <Input
                          id="my-account-two-factor-issuer"
                          name="twoFactorSetupIssuer"
                          value={twoFactorSetupIssuer}
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-account-name" className="text-sm font-medium">
                          Nama akaun
                        </label>
                        <Input
                          id="my-account-two-factor-account-name"
                          name="twoFactorSetupAccountName"
                          value={twoFactorSetupAccountName}
                          readOnly
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="my-account-two-factor-secret" className="text-sm font-medium">
                        Rahsia pengesah
                      </label>
                      <Input
                        id="my-account-two-factor-secret"
                        name="twoFactorSetupSecret"
                        value={twoFactorSetupSecret}
                        readOnly
                      />
                    </div>
                    {twoFactorSetupUri ? (
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-uri" className="text-sm font-medium">
                          URI pengesahan OTP
                        </label>
                        <Input
                          id="my-account-two-factor-uri"
                          name="twoFactorSetupUri"
                          value={twoFactorSetupUri}
                          readOnly
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
                  {!twoFactorEnabled ? (
                    <Button onClick={onStartTwoFactorSetup} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactorLoading && !twoFactorSetupSecret ? "Menyediakan..." : "Mulakan persediaan 2FA"}
                    </Button>
                  ) : null}
                  {(twoFactorPendingSetup || twoFactorSetupSecret) && !twoFactorEnabled ? (
                    <Button onClick={onEnableTwoFactor} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactorLoading ? "Mengesahkan..." : "Sahkan dan aktifkan 2FA"}
                    </Button>
                  ) : null}
                  {twoFactorEnabled ? (
                    <Button
                      variant="destructive"
                      onClick={onDisableTwoFactor}
                      disabled={securityBusy}
                      className="w-full sm:w-auto"
                    >
                      {twoFactorLoading ? "Menyahaktifkan..." : "Nyahaktifkan 2FA"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
