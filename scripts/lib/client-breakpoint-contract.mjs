import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const ALLOWED_CLIENT_BREAKPOINT_WIDTHS = [640, 767, 768, 1023, 1024];

export const CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS = [
  {
    filePath: "client/src/lib/responsive.ts",
    checks: [
      {
        label: "shared responsive contract defines the sm breakpoint",
        snippet: "sm: 640",
      },
      {
        label: "shared responsive contract defines the md breakpoint",
        snippet: "md: 768",
      },
      {
        label: "shared responsive contract defines the lg breakpoint",
        snippet: "lg: 1024",
      },
      {
        label: "shared responsive contract derives the mobile max width from md",
        snippet: "mobile: RESPONSIVE_BREAKPOINTS.md - 1",
      },
      {
        label: "shared responsive contract derives the tablet max width from lg",
        snippet: "tablet: RESPONSIVE_BREAKPOINTS.lg - 1",
      },
    ],
  },
  {
    filePath: "client/src/hooks/use-mobile.tsx",
    checks: [
      {
        label: "useIsMobile imports the shared responsive contract",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "useIsMobile reuses the shared mobile media query",
        snippet: "window.matchMedia(MOBILE_MEDIA_QUERY)",
      },
      {
        label: "useIsMobile resolves viewport width via the shared helper",
        snippet: "isMobileViewportWidth(window.innerWidth)",
      },
    ],
  },
  {
    filePath: "client/src/pages/activity/useActivityLogsLayoutPreference.ts",
    checks: [
      {
        label: "activity logs layout preference imports the shared responsive contract",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "activity logs layout preference reuses the shared mobile media query",
        snippet: "window.matchMedia(MOBILE_MEDIA_QUERY)",
      },
      {
        label: "activity logs layout preference resolves width via the shared helper",
        snippet: "isMobileViewportWidth(window.innerWidth)",
      },
    ],
  },
  {
    filePath: "client/src/pages/activity/useActivityPageState.ts",
    checks: [
      {
        label: "activity page state imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "activity page state defers mobile sections via the shared helper",
        snippet: "isMobileViewportWidth(window.innerWidth)",
      },
    ],
  },
  {
    filePath: "client/src/pages/Dashboard.tsx",
    checks: [
      {
        label: "dashboard imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "dashboard defers mobile sections via the shared helper",
        snippet: "isMobileViewportWidth(window.innerWidth)",
      },
    ],
  },
  {
    filePath: "client/src/pages/Analysis.tsx",
    checks: [
      {
        label: "analysis imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "analysis defers mobile sections via the shared helper",
        snippet: "isMobileViewportWidth(window.innerWidth)",
      },
    ],
  },
  {
    filePath: "client/src/pages/monitor/monitor-page-state-utils.ts",
    checks: [
      {
        label: "monitor page state imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "monitor page state resolves compact viewports via the shared helper",
        snippet: "const isCompactViewport = isMobileViewportWidth(width);",
      },
    ],
  },
  {
    filePath: "client/src/components/monitor/monitor-insights-utils.ts",
    checks: [
      {
        label: "monitor insights imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "monitor insights resolves compact viewports via the shared helper",
        snippet: "const isCompactViewport = isMobileViewportWidth(width);",
      },
    ],
  },
  {
    filePath: "client/src/components/monitor/monitor-overview-utils.ts",
    checks: [
      {
        label: "monitor overview imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "monitor overview delegates expansion to the shared helper",
        snippet: "return !isMobileViewportWidth(width);",
      },
    ],
  },
  {
    filePath: "client/src/pages/audit-logs/audit-log-page-state-utils.ts",
    checks: [
      {
        label: "audit logs page state imports the shared responsive helper",
        snippet: "from \"@/lib/responsive\"",
      },
      {
        label: "audit logs page state resolves mobile layout via the shared helper",
        snippet: "const isMobileViewport = isMobileViewportWidth(width);",
      },
    ],
  },
];

const CSS_WIDTH_MEDIA_QUERY_PATTERN = /@media[^{]*(?:min|max)-width:\s*(\d+)px/g;

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function collectCssFiles(directoryPath, basePath, filesByPath) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collectCssFiles(absolutePath, basePath, filesByPath);
      continue;
    }

    if (!entry.isFile() || !/\.css$/i.test(entry.name)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(basePath, absolutePath));
    if (Object.hasOwn(filesByPath, relativePath)) {
      continue;
    }
    filesByPath[relativePath] = readFileSync(absolutePath, "utf8");
  }
}

export function loadClientBreakpointContractFiles(params = {}) {
  const cwd = path.resolve(String(params.cwd || process.cwd()));
  const filesByPath = {};

  for (const requirement of CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS) {
    const absolutePath = path.join(cwd, requirement.filePath);
    filesByPath[normalizePath(requirement.filePath)] = readFileSync(absolutePath, "utf8");
  }

  collectCssFiles(path.join(cwd, "client", "src"), cwd, filesByPath);
  return filesByPath;
}

export function validateClientBreakpointContract(params = {}) {
  const filesByPath = params.filesByPath || {};
  const failures = [];
  let checkedRequirementFileCount = 0;
  let checkedRequirementCount = 0;
  let cssFileCount = 0;
  let cssBreakpointCount = 0;

  for (const requirement of CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS) {
    const filePath = normalizePath(requirement.filePath);
    const text = filesByPath[filePath];

    if (typeof text !== "string") {
      failures.push(`Missing required breakpoint contract file: ${filePath}`);
      continue;
    }

    checkedRequirementFileCount += 1;

    for (const check of requirement.checks) {
      checkedRequirementCount += 1;
      if (!text.includes(check.snippet)) {
        failures.push(`${filePath}: ${check.label}`);
      }
    }
  }

  for (const [rawFilePath, text] of Object.entries(filesByPath)) {
    const filePath = normalizePath(rawFilePath);
    if (!/\.css$/i.test(filePath) || typeof text !== "string") {
      continue;
    }

    cssFileCount += 1;

    for (const match of text.matchAll(CSS_WIDTH_MEDIA_QUERY_PATTERN)) {
      cssBreakpointCount += 1;
      const width = Number(match[1]);
      if (ALLOWED_CLIENT_BREAKPOINT_WIDTHS.includes(width)) {
        continue;
      }

      failures.push(
        `${filePath}: unsupported responsive breakpoint ${width}px (allowed: ${ALLOWED_CLIENT_BREAKPOINT_WIDTHS.join(", ")}px)`,
      );
    }
  }

  return {
    failures,
    summary: {
      requirementFileCount: CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS.length,
      checkedRequirementFileCount,
      requirementCount: CLIENT_BREAKPOINT_CONTRACT_REQUIREMENTS.reduce(
        (total, requirement) => total + requirement.checks.length,
        0,
      ),
      checkedRequirementCount,
      cssFileCount,
      cssBreakpointCount,
    },
  };
}

export function formatClientBreakpointContractReport(validation) {
  const failures = validation?.failures || [];
  const summary = validation?.summary || {};
  const inspected = `Client breakpoint contract inspected ${summary.checkedRequirementFileCount || 0}/${summary.requirementFileCount || 0} targeted files, ${summary.checkedRequirementCount || 0}/${summary.requirementCount || 0} contract markers, and ${summary.cssFileCount || 0} CSS files (${summary.cssBreakpointCount || 0} width media queries).`;

  if (failures.length === 0) {
    return `${inspected}\nBreakpoint tiers remain standardized around 640/767/768/1023/1024 across the guarded client viewport paths.`;
  }

  return [
    inspected,
    "Client breakpoint contract failures:",
    ...failures.map((failure) => `- ${failure}`),
  ].join("\n");
}
