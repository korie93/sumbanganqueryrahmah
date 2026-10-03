import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/app/types";
import { useToast } from "@/hooks/use-toast";
import { PersonalSecurityForm } from "@/pages/security/PersonalSecurityForm";
import { forceLogoutAfterPasswordChange, syncSettingsCurrentUser } from "@/pages/settings/settings-my-account-utils";
import { useSettingsMyAccountCredentialState } from "@/pages/settings/useSettingsMyAccountCredentialState";
import { useSettingsMyAccountTwoFactorState } from "@/pages/settings/useSettingsMyAccountTwoFactorState";
import type { CurrentUser } from "@/pages/settings/types";
import "./personal-account.css";

export default function SecurityPage({ user }: { user: User }) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const currentUser = useMemo<CurrentUser>(() => ({
    ...user,
    id: user.id ?? "",
    status: user.status ?? "active",
    mustChangePassword: user.mustChangePassword === true,
    fullName: user.fullName ?? null,
    email: user.email ?? null,
    createdAt: user.createdAt ?? null,
    avatarUrl: user.avatarUrl ?? null,
    passwordResetBySuperuser: user.passwordResetBySuperuser === true,
    isBanned: user.isBanned ?? null,
    twoFactorEnabled: user.twoFactorEnabled === true,
    twoFactorPendingSetup: user.twoFactorPendingSetup === true,
    twoFactorConfiguredAt: user.twoFactorConfiguredAt ?? null,
  }), [user]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  useEffect(() => setPasswordExpanded(false), [user.id, user.username]);

  const credentials = useSettingsMyAccountCredentialState({ currentUser, isMountedRef, toast, forceLogoutAfterPasswordChange });
  const twoFactor = useSettingsMyAccountTwoFactorState({ currentUser, isMountedRef, toast, syncCurrentUser: syncSettingsCurrentUser });

  return <div className="personal-page" data-testid="personal-security-page">
    <header className="personal-page-header">
      <h1>Security</h1>
      <p>Manage your password and account security.</p>
    </header>
    <PersonalSecurityForm
      {...credentials} {...twoFactor}
      currentUserRole={user.role}
      passwordExpanded={passwordExpanded} onPasswordExpandedChange={setPasswordExpanded}
      onClearPassword={credentials.clearPasswordFields}
      onChangePassword={() => void credentials.handleChangePassword()}
      onCurrentPasswordBlur={credentials.handleCurrentPasswordBlur} onCurrentPasswordInputChange={credentials.setCurrentPasswordInput}
      onNewPasswordBlur={credentials.handleNewPasswordBlur} onNewPasswordInputChange={credentials.setNewPasswordInput}
      onConfirmPasswordBlur={credentials.handleConfirmPasswordBlur} onConfirmPasswordInputChange={credentials.setConfirmPasswordInput}
      onDisableTwoFactor={() => void twoFactor.handleDisableTwoFactor()} onEnableTwoFactor={() => void twoFactor.handleEnableTwoFactor()}
      onStartTwoFactorSetup={() => void twoFactor.handleStartTwoFactorSetup()} onClearTwoFactorSetup={twoFactor.handleClearTwoFactorSetup}
      onTwoFactorPasswordBlur={twoFactor.handleTwoFactorPasswordBlur} onTwoFactorPasswordInputChange={twoFactor.setTwoFactorPasswordInput}
      onTwoFactorCodeBlur={twoFactor.handleTwoFactorCodeBlur} onTwoFactorCodeInputChange={twoFactor.setTwoFactorCodeInput}
      twoFactorEnabled={user.twoFactorEnabled === true} twoFactorPendingSetup={user.twoFactorPendingSetup === true}
      twoFactorConfiguredAt={user.twoFactorConfiguredAt ?? null}
    />
  </div>;
}
