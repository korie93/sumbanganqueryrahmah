export const DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS = [
  {
    filePath: "client/src/theme-tokens.css",
    checks: [
      {
        label: "theme tokens avoid relative hsl(from ...) color syntax",
        predicate: (text) => !text.includes("hsl(from"),
      },
      {
        label: "light theme exposes an explicit primary border token",
        predicate: (text) => text.includes("--primary-border: hsl(217 91% 42%);"),
      },
      {
        label: "light theme exposes an explicit accent border token",
        predicate: (text) => text.includes("--accent-border: hsl(214 28% 74%);"),
      },
      {
        label: "dark theme exposes an explicit primary border token",
        predicate: (text) => text.includes("--primary-border: hsl(217 91% 59%);"),
      },
      {
        label: "dark theme exposes an explicit destructive border token",
        predicate: (text) => text.includes("--destructive-border: hsl(0 62% 39%);"),
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
