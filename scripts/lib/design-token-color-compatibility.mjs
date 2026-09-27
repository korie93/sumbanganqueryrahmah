import { extractCssRuleBlock, parseHslTokens } from "./design-token-contrast.mjs";

function hasBrowserSafeBorder(text, selector, token) {
  const block = extractCssRuleBlock(text, selector);
  const declarations = [...block.matchAll(new RegExp(`--${token}:\\s*([^;]+);`, "g"))];
  const value = declarations.at(-1)?.[1]?.trim() || "";
  if (/^hsl\(\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%\)$/.test(value)) return true;
  const alias = value.match(/^hsl\(var\(--([a-z0-9-]+)\)\)$/);
  return Boolean(alias && parseHslTokens(block).has(alias[1]));
}

export const DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS = [
  {
    filePath: "client/src/styles/tokens/index.css",
    checks: [
      {
        label: "theme tokens avoid relative hsl(from ...) color syntax",
        predicate: (text) => !text.includes("hsl(from"),
      },
      {
        label: "light theme exposes a browser-safe primary border token",
        predicate: (text) => hasBrowserSafeBorder(text, ":root", "primary-border"),
      },
      {
        label: "light theme exposes a browser-safe accent border token",
        predicate: (text) => hasBrowserSafeBorder(text, ":root", "accent-border"),
      },
      {
        label: "dark theme exposes a browser-safe primary border token",
        predicate: (text) => hasBrowserSafeBorder(text, ".dark", "primary-border"),
      },
      {
        label: "dark theme exposes a browser-safe destructive border token",
        predicate: (text) => hasBrowserSafeBorder(text, ".dark", "destructive-border"),
      },
    ],
  },
];

export function validateDesignTokenColorCompatibility(params = {}) {
  const filesByPath = params.filesByPath || {};
  const failures = [];
  let checkedFileCount = 0;
  let checkedRuleCount = 0;

  for (const requirement of DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS) {
    const text = filesByPath[requirement.filePath];
    if (typeof text !== "string") {
      failures.push(`Missing required color compatibility file: ${requirement.filePath}`);
      continue;
    }

    checkedFileCount += 1;

    for (const check of requirement.checks) {
      checkedRuleCount += 1;
      if (!check.predicate(text)) {
        failures.push(`${requirement.filePath}: ${check.label}`);
      }
    }
  }

  return {
    failures,
    summary: {
      fileCount: DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS.length,
      checkedFileCount,
      ruleCount: DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS.reduce(
        (total, requirement) => total + requirement.checks.length,
        0,
      ),
      checkedRuleCount,
    },
  };
}

export function formatDesignTokenColorCompatibilityReport(validation) {
  const failures = validation?.failures || [];
  const summary = validation?.summary || {};
  const inspected = `Design token color compatibility inspected ${summary.checkedFileCount || 0}/${summary.fileCount || 0} files and ${summary.checkedRuleCount || 0}/${summary.ruleCount || 0} color rules.`;

  if (failures.length === 0) {
    return `${inspected}\nTheme border tokens stay on explicit browser-safe HSL values without hsl(from ...) syntax.`;
  }

  return [
    inspected,
    "Design token color compatibility failures:",
    ...failures.map((failure) => `- ${failure}`),
  ].join("\n");
}
