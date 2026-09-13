// Browser-only harness: real page/components, mocked HTTP supplied by the runner.
// This is not a backend or production authentication test.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ResetPassword from "../../client/src/pages/ResetPassword";
import ActivateAccount from "../../client/src/pages/ActivateAccount";
import ChangePassword from "../../client/src/pages/ChangePassword";
import Login from "../../client/src/pages/Login";
import { CollectionNicknameDialogStepFields } from "../../client/src/pages/collection-report/CollectionNicknameDialogStepFields";
import { MyAccountSecurityCard } from "../../client/src/pages/settings/MyAccountSecurityCard";
import { useSettingsMyAccountTwoFactorState } from "../../client/src/pages/settings/useSettingsMyAccountTwoFactorState";
import { useSettingsMyAccountCredentialState } from "../../client/src/pages/settings/useSettingsMyAccountCredentialState";
import "../../client/src/styles/tokens/index.css";
import "../../client/src/public-shell.css";
import "../../client/src/styles/theme/index.css";
import "../../client/src/index.css";

function CollectionPasswordHarness() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  return <main style={{ maxWidth: 560, margin: "24px auto", padding: 16 }}>
    <CollectionNicknameDialogStepFields
      confirmNicknamePassword={confirmation}
      dialogStep="setup"
      nicknameInput="ui.fixture"
      nicknamePassword={password}
      onConfirmNicknamePasswordChange={setConfirmation}
      onNicknameInputChange={() => {}}
      onNicknamePasswordChange={setPassword}
      onToggleLoginPassword={() => {}}
      onToggleSetupConfirmPassword={() => {}}
      onToggleSetupPassword={() => {}}
      resolvedNickname="ui.fixture"
      setupMode="forced-change"
      showLoginPassword={false}
      showSetupConfirmPassword={false}
      showSetupPassword={false}
      submittingNicknameAuth={false}
    />
  </main>;
}

function TwoFactorSetupHarness() {
  const [currentUser, setCurrentUser] = useState({ username: "ui.fixture", role: "admin", twoFactorEnabled: false, twoFactorPendingSetup: false });
  const [notice, setNotice] = useState("");
  const shared = { currentUser, isMountedRef: useRef(true), syncCurrentUser: setCurrentUser, toast: (value) => setNotice(value.description) };
  const state = useSettingsMyAccountTwoFactorState(shared);
  const credentials = useSettingsMyAccountCredentialState({
    ...shared,
    forceLogoutAfterPasswordChange: () => { document.body.dataset.loginRequested = "true"; },
  });
  return <main style={{ maxWidth: 960, margin: "24px auto", padding: 16 }}>
    <p role="status" id="fixture-notice">{notice}</p>
    <MyAccountSecurityCard
      {...state}
      {...credentials}
      currentUserRole="admin"
      onDisableTwoFactor={state.handleDisableTwoFactor} onEnableTwoFactor={state.handleEnableTwoFactor}
      onStartTwoFactorSetup={state.handleStartTwoFactorSetup}
      onTwoFactorCodeBlur={state.handleTwoFactorCodeBlur} onTwoFactorCodeInputChange={state.setTwoFactorCodeInput}
      onTwoFactorPasswordBlur={state.handleTwoFactorPasswordBlur} onTwoFactorPasswordInputChange={state.setTwoFactorPasswordInput}
      onChangePassword={credentials.handleChangePassword} onChangeUsername={credentials.handleChangeUsername}
      onConfirmPasswordBlur={credentials.handleConfirmPasswordBlur} onConfirmPasswordInputChange={credentials.setConfirmPasswordInput}
      onCurrentPasswordBlur={credentials.handleCurrentPasswordBlur} onCurrentPasswordInputChange={credentials.setCurrentPasswordInput}
      onNewPasswordBlur={credentials.handleNewPasswordBlur} onNewPasswordInputChange={credentials.setNewPasswordInput}
      onUsernameBlur={credentials.handleUsernameBlur} onUsernameInputChange={credentials.setUsernameInput}
      twoFactorEnabled={currentUser.twoFactorEnabled} twoFactorPendingSetup={currentUser.twoFactorPendingSetup}
    />
  </main>;
}

const view = new URLSearchParams(location.search).get("view");
const root = createRoot(document.getElementById("root"));
root.render(view === "activation"
  ? <ActivateAccount onBackToLogin={() => { document.body.dataset.loginRequested = "true"; }} />
  : view === "collection"
    ? <CollectionPasswordHarness />
    : view === "setup" || view === "settings"
      ? <TwoFactorSetupHarness />
    : view === "change"
      ? <ChangePassword username="ui.fixture" forced />
    : view === "login"
      ? <Login onLoginSuccess={() => { document.body.dataset.authenticated = "true"; }} />
      : <ResetPassword onBackToLogin={() => { document.body.dataset.loginRequested = "true"; }} />);
