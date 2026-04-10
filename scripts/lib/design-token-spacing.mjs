export const DESIGN_TOKEN_SPACING_REQUIREMENTS = [
  {
    filePath: "client/src/theme-tokens.css",
    checks: [
      {
        label: "theme tokens keep the spacing base unit",
        snippet: "--spacing: 0.25rem;",
      },
      {
        label: "theme tokens expose the px spacing token",
        snippet: "--spacing-px: 1px;",
      },
      {
        label: "theme tokens expose the half-step spacing token",
        snippet: "--spacing-0_5: calc(var(--spacing) * 0.5);",
      },
      {
        label: "theme tokens expose the core 4-step spacing token",
        snippet: "--spacing-4: calc(var(--spacing) * 4);",
      },
      {
        label: "theme tokens expose the 8-step spacing token",
        snippet: "--spacing-8: calc(var(--spacing) * 8);",
      },
      {
        label: "theme tokens expose the extended 24-step spacing token",
        snippet: "--spacing-24: calc(var(--spacing) * 24);",
      },
    ],
  },
  {
    filePath: "tailwind.config.ts",
    checks: [
      {
        label: "tailwind config extends the spacing scale",
        snippet: "spacing: {",
      },
      {
        label: "tailwind spacing maps the half-step token",
        snippet: "\"0.5\": \"var(--spacing-0_5)\"",
      },
      {
        label: "tailwind spacing maps the common 4-step token",
        snippet: "\"4\": \"var(--spacing-4)\"",
      },
      {
        label: "tailwind spacing maps the extended 24-step token",
        snippet: "\"24\": \"var(--spacing-24)\"",
      },
    ],
  },
  {
    filePath: "client/src/components/PublicAuthLayout.css",
    checks: [
      {
        label: "public auth layout consumes shared spacing tokens for shell padding",
        snippet: "padding: var(--spacing-6) var(--spacing-4);",
      },
      {
        label: "public auth layout consumes shared spacing tokens for card gaps",
        snippet: "gap: var(--spacing-4);",
      },
    ],
  },
  {
    filePath: "client/src/app/AuthenticatedAppShell.css",
    checks: [
      {
        label: "operational app shell consumes shared spacing tokens for page padding",
        snippet: "padding: var(--spacing-4);",
      },
      {
        label: "operational app shell consumes shared spacing tokens for frame gaps",
        snippet: "gap: var(--spacing-4);",
      },
    ],
  },
  {
    filePath: "client/src/components/ui/sidebar.tsx",
    checks: [
      {
        label: "sidebar width math relies on the shared spacing token",
        snippet: "var(--spacing-4)",
      },
    ],
  },
];

export function validateDesignTokenSpacingContract(params = {}) {
  const filesByPath = params.filesByPath || {};
  const failures = [];
  let checkedFileCount = 0;
  let checkedSnippetCount = 0;

  for (const requirement of DESIGN_TOKEN_SPACING_REQUIREMENTS) {
    const text = filesByPath[requirement.filePath];
    if (typeof text !== "string") {
      failures.push(`Missing required spacing contract file: ${requirement.filePath}`);
      continue;
    }

    checkedFileCount += 1;

    for (const check of requirement.checks) {
      checkedSnippetCount += 1;
      if (!text.includes(check.snippet)) {
        failures.push(`${requirement.filePath}: ${check.label}`);
      }
    }
  }

  return {
    failures,
    summary: {
      fileCount: DESIGN_TOKEN_SPACING_REQUIREMENTS.length,
      checkedFileCount,
      snippetCount: DESIGN_TOKEN_SPACING_REQUIREMENTS.reduce(
        (total, requirement) => total + requirement.checks.length,
        0,
      ),
      checkedSnippetCount,
    },
  };
}

export function formatDesignTokenSpacingContractReport(validation) {
  const failures = validation?.failures || [];
  const summary = validation?.summary || {};
  const inspected = `Design token spacing contract inspected ${summary.checkedFileCount || 0}/${summary.fileCount || 0} files and ${summary.checkedSnippetCount || 0}/${summary.snippetCount || 0} spacing markers.`;

  if (failures.length === 0) {
    return `${inspected}\nShared spacing tokens now cover the guarded theme, Tailwind, and shell layout surfaces.`;
  }

  return [
    inspected,
    "Design token spacing contract failures:",
    ...failures.map((failure) => `- ${failure}`),
  ].join("\n");
}
