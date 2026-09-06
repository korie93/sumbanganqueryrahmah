import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BillingPrincipalAging } from "@/lib/api/collection-billing-principal";
import { validateBillingPrincipalTargetFields } from "./BillingPrincipalSavedTargetDialog";
import { BillingPrincipalSavedTargetUpdatedAt } from "./BillingPrincipalSavedTargetShell";

const validPercentages: Record<BillingPrincipalAging, string> = {
  D3: "30", D4: "25.1250", D5: "0", D6: "100.0000",
};

test("shared target validation accepts complete exact D3–D6 percentages and a trimmed custom name", () => {
  assert.deepEqual(validateBillingPrincipalTargetFields("  September — Team A  ", validPercentages), {
    nameError: "", percentageErrors: { D3: "", D4: "", D5: "", D6: "" }, valid: true,
  });
  assert.equal(validateBillingPrincipalTargetFields("N".repeat(120), validPercentages).valid, true);
});

test("shared target validation identifies missing, oversized and unsafe names without accepting invalid saves", () => {
  for (const name of ["", "   ", "\t\n"]) {
    const result = validateBillingPrincipalTargetFields(name, validPercentages);
    assert.equal(result.valid, false);
    assert.equal(result.nameError, "Target name is required.");
  }
  assert.match(validateBillingPrincipalTargetFields("N".repeat(121), validPercentages).nameError, /120/);
  for (const name of ["<script>alert(1)</script>", "javascript:alert(1)", "data:text/html,unsafe", "Bad\u0000name"]) {
    const result = validateBillingPrincipalTargetFields(name, validPercentages);
    assert.equal(result.valid, false);
    assert.match(result.nameError, /plain text/);
  }
});

test("each aging has an independent accessible percentage error until its decimal input is valid", () => {
  const invalidValues = ["", " ", "-1", "101", "100.0001", "12.12345", "1e2", "+25", "1,0", "NaN", "Infinity"];
  for (const aging of ["D3", "D4", "D5", "D6"] as const) {
    for (const value of invalidValues) {
      const result = validateBillingPrincipalTargetFields("Valid target", { ...validPercentages, [aging]: value });
      assert.equal(result.valid, false, `${aging} must reject ${JSON.stringify(value)}`);
      assert.equal(result.nameError, "");
      assert.match(result.percentageErrors[aging], new RegExp(`^${aging} Target %`));
      for (const other of ["D3", "D4", "D5", "D6"] as const) {
        if (other !== aging) assert.equal(result.percentageErrors[other], "");
      }
    }
  }
  assert.equal(validateBillingPrincipalTargetFields("Valid target", { ...validPercentages, D3: " 0.0001 " }).valid, true);
});

test("shared target form wires invalid state to submit protection and labelled field errors", () => {
  const source = readFileSync(new URL("./BillingPrincipalSavedTargetDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /const validation = validateBillingPrincipalTargetFields\(name, percentages\)/);
  assert.match(source, /if \(!validation\.valid\)\s*\{[^}]*return;/);
  assert.match(source, /type="submit" disabled=\{[^}]*saving[^}]*!preview[^}]*!admin[^}]*!validation\.valid\}/);
  assert.match(source, /getAriaInvalidProps\(Boolean\(validation\.nameError\)\)/);
  assert.match(source, /aria-describedby=\{validation\.nameError \? "osp-target-name-error" : undefined\}/);
  assert.match(source, /id="osp-target-name-error" role="alert"/);
  assert.match(source, /getAriaInvalidProps\(Boolean\(validation\.percentageErrors\[aging\]\)\)/);
  assert.match(source, /aria-describedby=\{validation\.percentageErrors\[aging\] \? `osp-target-\$\{aging\}-error` : undefined\}/);
  assert.match(source, /id=\{`osp-target-\$\{aging\}-error`\} role="alert"/);
});

test("target last-updated metadata shows Malaysia time, its explicit UTC offset and machine-readable instant", () => {
  const markup = renderToStaticMarkup(createElement(BillingPrincipalSavedTargetUpdatedAt, {
    value: "2026-09-05T16:30:00.000Z",
  }));
  assert.match(markup, /Last updated:/);
  assert.match(markup, /dateTime="2026-09-05T16:30:00\.000Z"/);
  assert.match(markup, /06\/09\/2026/);
  assert.match(markup, /12:30 AM/);
  assert.match(markup, /MYT \(UTC\+08:00\)/);
});

test("invalid target update times have an explicit safe fallback and no fabricated timestamp", () => {
  for (const value of ["", "invalid-date", "<script>unsafe</script>"]) {
    const markup = renderToStaticMarkup(createElement(BillingPrincipalSavedTargetUpdatedAt, { value }));
    assert.match(markup, /Last updated: Unavailable/);
    assert.doesNotMatch(markup, /<time|<script|Invalid Date/);
  }
  const source = readFileSync(new URL("./BillingPrincipalSavedTargetShell.tsx", import.meta.url), "utf8");
  assert.match(source, /<BillingPrincipalSavedTargetUpdatedAt value=\{selectedTarget\.updatedAt\}/);
});
