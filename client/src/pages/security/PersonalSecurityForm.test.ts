import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("PersonalSecurityForm reuses the existing Malay password and 2FA controls", () => {
  const card = readFileSync(path.join(__dirname, "PersonalSecurityForm.tsx"), "utf8");
  const source = card + readFileSync(path.join(__dirname, "../settings/TwoFactorSettingsPanel.tsx"), "utf8");

  assert.match(source, /Kata laluan semasa/);
  assert.match(source, /Kata laluan baharu/);
  assert.match(source, /Sahkan kata laluan/);
  assert.match(source, /Tukar kata laluan/);
  assert.match(source, /Pengesahan Dua Faktor/);
  assert.match(source, /Kod pengesah/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /autoComplete="new-password"/);
  assert.match(source, /autoComplete="one-time-code"/);
  assert.match(card, /<TwoFactorSettingsPanel/);

  assert.doesNotMatch(source, />Account Security</);
  assert.doesNotMatch(source, />Current Password</);
  assert.doesNotMatch(source, />New Password</);
  assert.doesNotMatch(source, />Confirm Password</);
  assert.doesNotMatch(source, /onChangeUsername|accountUsername|accountRole|LogOut|Logout/);
});

test("the canonical password hook submits only password fields and guards cancellation and concurrent submits", () => {
  const source = readFileSync(path.join(__dirname, "../settings/useSettingsMyAccountCredentialState.ts"), "utf8");
  assert.match(source, /changeMyPassword\(\{/);
  assert.match(source, /currentPassword: currentPasswordInput/);
  assert.match(source, /newPassword: newPasswordInput/);
  assert.match(source, /signal: controller.signal/);
  assert.match(source, /requestRef.current \|\| accountKeyRef.current !== accountKey/);
  assert.match(source, /requestRef.current\?\.abort\(\)/);
  assert.match(source, /if \(response.forceLogout\) forceLogoutAfterPasswordChange\(\)/);
  assert.doesNotMatch(source, /updateMyCredentials|newUsername|email:|role:|permissions:|console\./);
});
