import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { getPasswordRequirements } from "@/lib/password-requirements";

const stylesheetHook = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
    return nextLoad(url, context);
  },
});
const { CredentialRecoveryLayout } = await import("./CredentialRecoveryLayout");
stylesheetHook.deregister();

const account = { username: "operator.long-name", role: "user", expiresAt: "2099-01-01T00:00:00Z" };

function render(accountDetails: typeof account | null = account) {
  return renderToStaticMarkup(createElement(CredentialRecoveryLayout, {
    account: accountDetails,
    children: createElement("form", null, createElement("input", { id: "fixture-password", type: "password", autoComplete: "new-password" })),
    title: "Create your password",
    description: "Complete your account activation.",
    intent: "activation",
  }));
}

test("recovery shell has one heading and contextual account details outside the form", () => {
  const markup = render();
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
  assert.match(markup, /id="main-content" tabindex="-1" lang="ms"/);
  assert.match(markup, /aria-labelledby="credential-recovery-title"/);
  assert.match(markup, /<aside[^>]*>[\s\S]*operator.long-name[\s\S]*<\/aside>/);
  assert.doesNotMatch(markup.match(/<form>[\s\S]*<\/form>/)?.[0] ?? "", /operator.long-name|<dl/);
  assert.equal((markup.match(/operator.long-name/g) ?? []).length, 1);
  assert.match(markup, /\(MYT\)/);
  assert.match(markup, /<img src="\/brand\/sidebar-q-static\.png"[^>]*alt="" aria-hidden="true"/);
  assert.doesNotMatch(markup, /sqr-q-mark-(?:light|dark)\.png/);
  assert.doesNotMatch(markup, /auth-v17-art|auth-v17-status|auth-v17-secure|sqr-illustration/);
});

test("unvalidated recovery views never fabricate or reveal account metadata", () => {
  const markup = render(null);
  assert.doesNotMatch(markup, /public-auth-account-summary|operator.long-name|2099|MYT/);
  assert.match(markup, /Pautan sekali guna/);
  assert.match(markup, /Hubungi pentadbir/);
});

test("recovery theme and language controls have independent non-submit semantics", () => {
  const markup = render();
  assert.match(markup, /<button type="button" class="credential-recovery__theme"[^>]*aria-label="Tukar ke tema gelap"/);
  assert.match(markup, /role="group" aria-label="Bahasa \/ Language"/);
  assert.match(markup, /lang="ms" aria-label="Bahasa Melayu" aria-pressed="true"/);
  assert.match(markup, /lang="en" aria-label="English" aria-pressed="false"/);
  assert.doesNotMatch(markup, /key="(?:dark|light|ms|en)"/);
});

test("recovery metadata is escaped and kept complete without a truncation contract", () => {
  const username = `long.${"managed".repeat(30)}<script>alert(1)</script>`;
  const markup = render({ ...account, username });
  assert.ok(markup.includes(username.replace(/</g, "&lt;").replace(/>/g, "&gt;")));
  assert.doesNotMatch(markup, /<script>/);
  const css = readFileSync(new URL("./CredentialRecoveryLayout.css", import.meta.url), "utf8");
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|overflow:\s*hidden/);
});

test("recovery layout reserves natural form width, mobile flow and accessible tap targets", () => {
  const css = readFileSync(new URL("./CredentialRecoveryLayout.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("./CredentialRecoveryLayout.tsx", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: minmax\(230px, 30%\) minmax\(0, 1fr\)/);
  assert.match(css, /width: min\(100%, 440px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.credential-recovery__workspace \{ display: block; min-height: 100dvh/);
  assert.match(css, /min-width: 44px; min-height: 44px/);
  assert.match(css, /min-height: 48px; height: 48px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /window\.addEventListener\("offline", update\)/);
  assert.match(source, /window\.removeEventListener\("offline", update\)/);
  assert.doesNotMatch(source, /fetch\(|setInterval|setTimeout|localStorage|sessionStorage|dangerouslySetInnerHTML/);
});

test("compact recovery requirements preserve five independent live policy checks and comfortable defaults", () => {
  for (const locale of ["ms", "en"] as const) {
    for (const password of ["", "short", "abcdefghijklmno", "LongerPassword1!", `${"a".repeat(256)}A1!`]) {
      const expected = getPasswordRequirements(password, locale);
      const markup = renderToStaticMarkup(createElement(PasswordStrengthMeter, {
        id: "fixture-strength", password, variant: "checklist", density: "compact", interacted: password.length > 0, locale,
      }));
      assert.match(markup, /data-password-requirements-density="compact"/);
      assert.match(markup, /<ul class="mt-3" aria-label="(?:Password rules|Syarat kata laluan)"/);
      assert.match(markup, /14–256 (?:characters|aksara)/);
      assert.match(markup, /data-password-requirement-count="true" aria-live="polite" aria-atomic="true"/);
      assert.equal((markup.match(/data-password-requirement="/g) ?? []).length, 5);
      assert.equal((markup.match(/class="sr-only"/g) ?? []).length, 5);
      assert.equal((markup.match(/data-password-strength-segment="/g) ?? []).length, 5);
      assert.equal((markup.match(/data-state="success"/g) ?? []).length, expected.satisfiedCount);
      assert.ok(markup.includes(`data-password-policy-status="${expected.valid ? "valid" : "incomplete"}"`));
      if (password) assert.ok(!markup.includes(password), "credential values never appear in feedback");
    }
    const defaultMarkup = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: "", variant: "checklist", locale }));
    assert.match(defaultMarkup, /data-password-requirements-density="comfortable"/);
    assert.match(defaultMarkup, /<ul class="mt-3 space-y-2"/);
    assert.ok(defaultMarkup.includes(getPasswordRequirements("", locale).requirements[0].label));
    assert.match(defaultMarkup, /Symbol \(for example|Simbol \(contoh/);
  }
});

test("recovery context, toolbar and form use coordinated alignment rails", () => {
  const css = readFileSync(new URL("./CredentialRecoveryLayout.css", import.meta.url), "utf8");
  assert.match(css, /\.credential-recovery__context \{[^}]*padding: 20px 28px 36px/);
  assert.match(css, /\.credential-recovery__controls \{[^}]*width: min\(100%, 440px\)[^}]*margin: 0 auto 16px/);
  assert.match(css, /padding: 24px max\(16px, calc\(\(100vw - 440px\) \/ 2\)\)/);
  assert.doesNotMatch(css, /100vw - 480px/);
});
