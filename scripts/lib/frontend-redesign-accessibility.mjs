import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

// Inspect the actual rendered page. No route interception, CSS replacement,
// rule exclusions, credential capture or production application changes.
export async function runRedesignAccessibility(page) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations", "incomplete", "passes"],
    });
    return result;
  });
  return summarizeRedesignAccessibility(result);
}

export function summarizeRedesignAccessibility(result) {
  const summarizeCheck = (check, group) => {
    // Axe messages and data.needsReview may echo attribute values. Preserve
    // only engine identifiers and tightly validated diagnostic measurements.
    const data = check.data && typeof check.data === "object" && !Array.isArray(check.data) ? check.data : {};
    const safe = {};
    if (typeof data.messageKey === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(data.messageKey)) safe.messageKey = data.messageKey;
    if (typeof data.contrastRatio === "number" && Number.isFinite(data.contrastRatio)) safe.contrastRatio = data.contrastRatio;
    for (const key of ["fgColor", "bgColor", "shadowColor"]) {
      if (typeof data[key] === "string" && /^#[a-fA-F0-9]{6}$/.test(data[key])) safe[key] = data[key];
    }
    if (typeof data.expectedContrastRatio === "string" && /^\d+(?:\.\d+)?:1$/.test(data.expectedContrastRatio)) safe.expectedContrastRatio = data.expectedContrastRatio;
    if (["normal", "bold"].includes(data.fontWeight)) safe.fontWeight = data.fontWeight;
    if (typeof data.fontSize === "string" && /^\d+(?:\.\d+)?pt \(\d+(?:\.\d+)?px\)$/.test(data.fontSize)) safe.fontSize = data.fontSize;
    return { id: check.id, group, ...safe };
  };
  const summarizeRules = (rules = []) => rules.map((rule) => ({
    id: rule.id,
    impact: rule.impact ?? null,
    nodeCount: rule.nodes.length,
    // Selectors locate issues in the synthetic fixture without storing DOM text,
    // input values, HTML, screenshots of credentials or axe's raw result tree.
    targets: rule.nodes.map((node) => node.target),
    checks: rule.nodes.map((node) => ({ target: node.target,
      reasons: ["any", "all", "none"].flatMap((group) => (node[group] ?? []).map((check) => summarizeCheck(check, group))),
    })),
  }));
  return {
    violations: summarizeRules(result.violations),
    incomplete: summarizeRules(result.incomplete),
    passedRuleCount: result.passes?.length ?? 0,
  };
}

// Axe does not recognize Radix's modal menu as a dialog. Keep its raw finding;
// only the exact hidden root/focus checks can be resolved by same-state real
// keyboard evidence. Other nodes, rules, missing proof or mismatched states fail.
export function reviewRedesignAccessibilityViolations(entry, keyboardReviews = []) {
  const reviewed = keyboardReviews.some((review) => review.id === entry.id && review.theme === entry.theme && review.width === entry.width
    && review.ruleId === "aria-hidden-focus" && review.target === "#root"
    && review.status === "verified-focus-trapped-modal-menu" && review.tabContained === true
    && review.shiftTabContained === true && review.escapeRestored === true && review.reopenedContained === true
    && review.triggerOwnedPopup === true && review.rootHidden === true);
  const manuallyResolved = [];
  const unresolved = [];
  for (const violation of entry.violations) {
    const rootOnly = violation.nodeCount === 1 && violation.targets?.length === 1
      && violation.targets[0]?.length === 1 && violation.targets[0][0] === "#root";
    const checks = violation.checks;
    const knownReasons = checks?.length === 1 && checks[0].target?.length === 1 && checks[0].target[0] === "#root"
      && checks[0].reasons?.length === 2 && ["focusable-disabled", "focusable-not-tabbable"].every((id) =>
        checks[0].reasons.some((reason) => reason.id === id && reason.group === "all"));
    (reviewed && violation.id === "aria-hidden-focus" && rootOnly && knownReasons ? manuallyResolved : unresolved).push(violation);
  }
  return { manuallyResolved, unresolved };
}
