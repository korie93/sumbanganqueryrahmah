import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { Router } from "wouter";
import ChangePassword from "./ChangePassword";
import { PersonalSecurityForm } from "./security/PersonalSecurityForm";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), "client/src", file), "utf8");

function securityProps(role: string, busy = false): ComponentProps<typeof PersonalSecurityForm> {
  return {
    confirmPasswordInput: "", confirmPasswordError: null, currentPasswordInput: "", currentPasswordError: null,
    currentUserRole: role, newPasswordInput: "", newPasswordError: null,
    passwordSaving: busy, twoFactorLoading: false, twoFactorEnabled: false,
    twoFactorPendingSetup: false, twoFactorPasswordInput: "", twoFactorPasswordError: null,
    twoFactorCodeInput: "", twoFactorCodeError: null, twoFactorSetupAccountName: "", twoFactorSetupIssuer: "",
    twoFactorSetupSecret: "", twoFactorSetupUri: "",
    onDisableTwoFactor() {}, onEnableTwoFactor() {}, onChangePassword() {},
    onConfirmPasswordBlur() {}, onConfirmPasswordInputChange() {}, onCurrentPasswordBlur() {}, onCurrentPasswordInputChange() {},
    onNewPasswordBlur() {}, onNewPasswordInputChange() {}, onStartTwoFactorSetup() {}, onTwoFactorCodeBlur() {},
    onTwoFactorCodeInputChange() {}, onTwoFactorPasswordBlur() {}, onTwoFactorPasswordInputChange() {},
    passwordExpanded: true, onPasswordExpandedChange() {}, onClearPassword() {},
  };
}

test("change-password helpers and status messages use readable shared auth surfaces", () => {
  const html = renderToStaticMarkup(createElement(Router, {
    ssrPath: "/change-password",
    children: createElement(ChangePassword, { username: "fixture", forced: true }),
  }));
  assert.match(html, /class="public-auth-note"/);
  assert.match(html, /Gunakan kata laluan baharu yang sukar diteka/);
  assert.match(html, /Pertukaran kata laluan diwajibkan untuk fixture/);
  const page = source("pages/ChangePassword.tsx");
  assert.doesNotMatch(page, /text-(?:white\/75|amber-100|red-100|emerald-100)/);
  assert.match(page, /public-auth-status-card public-auth-status-card--error" role="alert"/);
  assert.match(page, /public-auth-status-card public-auth-status-card--success" role="status" aria-live="polite"/);
  assert.equal((page.match(/className="text-sm text-destructive" role="alert"/g) ?? []).length, 2);
});

test("personal security uses flat labelled password and 2FA sections without identity editing", () => {
  const html = renderToStaticMarkup(createElement(PersonalSecurityForm, securityProps("admin")));
  assert.equal((html.match(/class="shadcn-card /g) ?? []).length, 0);
  assert.match(html, /<section[^>]*aria-labelledby="security-password-heading"/);
  assert.match(html, /aria-label="Change password"/);
  assert.match(html, /sm:grid-cols-2/);
  assert.doesNotMatch(html, /md:grid-cols-3/);
  assert.doesNotMatch(html, /my-account-username|my-account-role|Log Keluar|Logout/);
  assert.equal((html.match(/type="password"/g) ?? []).length, 3);
  assert.equal((html.match(/autoComplete="new-password"/gi) ?? []).length, 2);
  for (const id of ["current-password", "new-password", "confirm-password"]) {
    assert.match(html, new RegExp(`for="my-account-${id}"`));
    assert.match(html, new RegExp(`aria-controls="my-account-${id}"`));
  }
});

test("security presentation preserves 2FA role gate and shared busy guards", () => {
  for (const role of ["user", "manager", "admin", "superuser"]) {
    const html = renderToStaticMarkup(createElement(PersonalSecurityForm, securityProps(role, true)));
    const supportsTwoFactor = role === "admin" || role === "superuser";
    assert.equal(html.includes('data-testid="two-factor-settings"'), supportsTwoFactor);
    assert.equal(html.includes('data-testid="two-factor-unavailable"'), !supportsTwoFactor);
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    assert.equal(inputs.length, 3);
    assert.ok(inputs.every((input) => input.includes('disabled=""')));
    assert.match(html, /type="password"/);
  }
  const page = source("pages/security/PersonalSecurityForm.tsx");
  assert.match(page, /props.passwordSaving \|\| props.twoFactorLoading/);
  assert.match(page, /event.preventDefault\(\); if \(!busy\) props.onChangePassword\(\)/);
  assert.match(page, /<TwoFactorSettingsPanel \{\.\.\.props\} busy=\{busy\}/);
  assert.doesNotMatch(page, /onChangeUsername/);
});

test("personal security keeps the password form closed until requested", () => {
  const html = renderToStaticMarkup(createElement(PersonalSecurityForm, { ...securityProps("user"), passwordExpanded: false }));
  assert.match(html, /data-testid="security-change-password"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /type="password"|<form/);
  assert.match(html, /current security policy/);
});

test("Settings has no personal credential state or duplicate personal form", () => {
  const page = source("pages/Settings.tsx");
  const controller = source("pages/settings/useSettingsController.tsx");
  assert.doesNotMatch(page + controller, /AccountSecuritySection|useSettingsMyAccount|useSettingsSecurityViewModel|PersonalSecurityForm/);
  assert.match(page, /currentCategory\?\.settings/);
  const security = source("pages/Security.tsx");
  assert.match(security, /useSettingsMyAccountCredentialState/);
  assert.match(security, /useSettingsMyAccountTwoFactorState/);
  assert.doesNotMatch(security, /getMe|logout|newUsername/);
});
