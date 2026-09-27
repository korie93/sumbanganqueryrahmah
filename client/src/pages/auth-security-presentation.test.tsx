import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { Router } from "wouter";
import ChangePassword from "./ChangePassword";
import { MyAccountSecurityCard } from "./settings/MyAccountSecurityCard";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), "client/src", file), "utf8");

function securityProps(role: string, busy = false): ComponentProps<typeof MyAccountSecurityCard> {
  return {
    confirmPasswordInput: "", confirmPasswordError: null, currentPasswordInput: "", currentPasswordError: null,
    currentUserRole: role, newPasswordInput: "", newPasswordError: null, usernameInput: "fixture", usernameError: null,
    passwordSaving: busy, usernameSaving: false, twoFactorLoading: false, twoFactorEnabled: false,
    twoFactorPendingSetup: false, twoFactorPasswordInput: "", twoFactorPasswordError: null,
    twoFactorCodeInput: "", twoFactorCodeError: null, twoFactorSetupAccountName: "", twoFactorSetupIssuer: "",
    twoFactorSetupSecret: "", twoFactorSetupUri: "",
    onDisableTwoFactor() {}, onEnableTwoFactor() {}, onChangePassword() {}, onChangeUsername() {},
    onConfirmPasswordBlur() {}, onConfirmPasswordInputChange() {}, onCurrentPasswordBlur() {}, onCurrentPasswordInputChange() {},
    onNewPasswordBlur() {}, onNewPasswordInputChange() {}, onStartTwoFactorSetup() {}, onTwoFactorCodeBlur() {},
    onTwoFactorCodeInputChange() {}, onTwoFactorPasswordBlur() {}, onTwoFactorPasswordInputChange() {},
    onUsernameBlur() {}, onUsernameInputChange() {},
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

test("account security uses one outer card and labelled identity/password region", () => {
  const html = renderToStaticMarkup(createElement(MyAccountSecurityCard, securityProps("admin")));
  assert.equal((html.match(/class="shadcn-card /g) ?? []).length, 1);
  assert.match(html, /<section[^>]*aria-labelledby="my-account-heading"/);
  assert.match(html, /id="my-account-heading"[^>]*>Akaun Saya/);
  assert.match(html, /lg:grid-cols-2/);
  assert.doesNotMatch(html, /md:grid-cols-3/);
  assert.equal((html.match(/type="password"/g) ?? []).length, 3);
  assert.equal((html.match(/autoComplete="new-password"/gi) ?? []).length, 2);
  for (const id of ["current-password", "new-password", "confirm-password"]) {
    assert.match(html, new RegExp(`for="my-account-${id}"`));
    assert.match(html, new RegExp(`aria-controls="my-account-${id}"`));
  }
});

test("security presentation preserves 2FA role gate and shared busy guards", () => {
  for (const role of ["user", "admin", "superuser"]) {
    const html = renderToStaticMarkup(createElement(MyAccountSecurityCard, securityProps(role, true)));
    assert.equal(html.includes('data-testid="two-factor-settings"'), role !== "user");
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    assert.equal(inputs.length, 5);
    assert.ok(inputs.every((input) => input.includes('disabled=""')));
    assert.match(html, /type="password"/);
  }
  const page = source("pages/settings/MyAccountSecurityCard.tsx");
  assert.match(page, /usernameSaving \|\| passwordSaving \|\| twoFactorLoading/);
  assert.match(page, /onClick=\{onChangePassword\}/);
  assert.match(page, /onClick=\{onChangeUsername\}/);
  assert.match(page, /onEnableTwoFactor=\{onEnableTwoFactor\}/);
  assert.match(page, /onDisableTwoFactor=\{onDisableTwoFactor\}/);
});
