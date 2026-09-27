import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { reviewRedesignAccessibilityViolations, runRedesignAccessibility, summarizeRedesignAccessibility } from "../lib/frontend-redesign-accessibility.mjs";

test("redesign accessibility keeps all impact levels and unresolved manual checks", () => {
  const result = summarizeRedesignAccessibility({
    violations: ["minor", "moderate", "serious", "critical"].map((impact) => ({
      id: `rule-${impact}`, impact, nodes: [{ target: ["#example"], html: "private input value" }],
    })),
    incomplete: [{ id: "color-contrast", impact: null, nodes: [{ target: [".label"], failureSummary: "raw DOM details" }] }],
    passes: [{ id: "label" }, { id: "button-name" }],
  });
  assert.equal(result.violations.length, 4);
  assert.equal(result.incomplete.length, 1);
  assert.equal(result.passedRuleCount, 2);
  assert.deepEqual(result.violations[1], { id: "rule-moderate", impact: "moderate", nodeCount: 1, targets: [["#example"]], checks: [{ target: ["#example"], reasons: [] }] });
  assert.doesNotMatch(JSON.stringify(result), /private input|raw DOM|html|failureSummary/);
});

test("accessibility diagnostics retain engine reasons and measurements without raw attributes or text", () => {
  const result = summarizeRedesignAccessibility({ incomplete: [{ id: "color-contrast", nodes: [{ target: [".badge"],
    any: [{ id: "color-contrast", message: "raw private message", data: { messageKey: "bgOverlap", contrastRatio: 2.43, expectedContrastRatio: "4.5:1", fgColor: "#aabbcc", bgColor: "#ffffff", fontSize: "9.0pt (12px)", fontWeight: "normal", needsReview: "private attribute", raw: "raw private content" } }],
    all: [{ id: "aria-valid-attr-value", data: { messageKey: "controlsWithinPopup", needsReview: "private attribute" } }],
    none: [{ id: "untrusted", data: { messageKey: "<private>", bgColor: "secret", fontSize: "token", contrastRatio: Infinity, expectedContrastRatio: "secret", fontWeight: "secret" } }],
  }] }] });
  const reasons = result.incomplete[0].checks[0].reasons;
  assert.equal(reasons[0].messageKey, "bgOverlap");
  assert.equal(reasons[0].contrastRatio, 2.43);
  assert.equal(reasons[0].expectedContrastRatio, "4.5:1");
  assert.equal(reasons[1].messageKey, "controlsWithinPopup");
  assert.deepEqual(reasons[2], { id: "untrusted", group: "none" });
  assert.doesNotMatch(JSON.stringify(result), /private|secret|needsReview|token/);
});

test("redesign accessibility executes the installed axe engine against the rendered document", async () => {
  const evaluations = [];
  const page = { async evaluate(script) {
    evaluations.push(script);
    return typeof script === "function" ? { violations: [], incomplete: [], passes: [{ id: "label" }] } : undefined;
  } };
  assert.deepEqual(await runRedesignAccessibility(page), { violations: [], incomplete: [], passedRuleCount: 1 });
  assert.equal(evaluations.length, 2);
  assert.equal(typeof evaluations[0], "string");
  assert.ok(evaluations[0].includes("axe"));
  assert.match(String(evaluations[1]), /window\.axe\.run\(document/);
  assert.match(String(evaluations[1]), /"wcag2a", "wcag2aa", "wcag21a", "wcag21aa"/);
});

test("redesign accessibility has no rule disable or synthetic DOM replacement", async () => {
  const source = await readFile(new URL("../lib/frontend-redesign-accessibility.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /enabled:\s*false|setContent\(|route\.fulfill|bypassCSP|addStyleTag|innerHTML\s*=/);
  assert.match(source, /require\.resolve\("axe-core\/axe.min.js"\)/);
});

test("manual focus review resolves only exact same-state root menu findings and retains original evidence", () => {
  const violation = { id: "aria-hidden-focus", nodeCount: 1, targets: [["#root"]], checks: [{ target: ["#root"],
    reasons: [{ id: "focusable-disabled", group: "all" }, { id: "focusable-not-tabbable", group: "all" }],
  }] };
  const entry = { id: "saved-file-actions", theme: "dark", width: 390, violations: [violation] };
  const review = { id: entry.id, theme: entry.theme, width: entry.width, ruleId: "aria-hidden-focus", target: "#root",
    status: "verified-focus-trapped-modal-menu", rootHidden: true, triggerOwnedPopup: true,
    tabContained: true, shiftTabContained: true, escapeRestored: true, reopenedContained: true };
  assert.deepEqual(reviewRedesignAccessibilityViolations(entry, [review]), { manuallyResolved: [violation], unresolved: [] });
  assert.deepEqual(entry.violations, [violation]);
  for (const missing of Object.keys(review)) {
    const incomplete = { ...review };
    delete incomplete[missing];
    assert.equal(reviewRedesignAccessibilityViolations(entry, [incomplete]).unresolved.length, 1, `${missing} proof is mandatory`);
  }
  for (const wrong of [{ id: "activity-row-actions" }, { theme: "light" }, { width: 1440 }, { target: "#other" }]) {
    assert.equal(reviewRedesignAccessibilityViolations(entry, [{ ...review, ...wrong }]).unresolved.length, 1);
  }
  for (const changed of [
    { id: "color-contrast" }, { nodeCount: 2 }, { targets: [["#other"]] }, { targets: [["#root"], ["#other"]] },
    { checks: [{ target: ["#root"], reasons: [{ id: "unknown", group: "all" }] }] },
    { checks: [{ target: ["#other"], reasons: violation.checks[0].reasons }] },
  ]) {
    assert.equal(reviewRedesignAccessibilityViolations({ ...entry, violations: [{ ...violation, ...changed }] }, [review]).unresolved.length, 1);
  }
  assert.equal(reviewRedesignAccessibilityViolations(entry).unresolved.length, 1);
});
