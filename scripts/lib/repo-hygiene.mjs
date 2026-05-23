const ALLOWED_SECRET_VALUE_PATTERNS = [
  /^$/,
  /^null$/i,
  /^undefined$/i,
  /^\$\{\{\s*secrets\.[^}]+\}\}$/i,
  /^\$[A-Z0-9_]+$/,
  /^\$\{[A-Z0-9_]+\}$/,
  /change-this/i,
  /example/i,
  /placeholder/i,
  /ganti-dengan/i,
  /kata-laluan/i,
  /credential/i,
  /akaun-smtp/i,
  /smtp\.provider/i,
  /^SMTP_PASS(?:WORD)?$/i,
  /^process\.env\.SMTP_PASS(?:WORD)?$/i,
  /^optionalEnvString\(\s*['"`]SMTP_PASS(?:WORD)?['"`]\s*(?:,|\))/i,
  /^readOptionalString\(\s*['"`]SMTP_PASS(?:WORD)?['"`]\s*\)/i,
];

const FORBIDDEN_TYPESCRIPT_PATTERN_RULES = [
  {
    label: "type assertion 'as any'",
    regex: /\bas\s+any\b/,
  },
  {
    label: "TypeScript suppression '@ts-ignore'",
    regex: /@ts-ignore\b/,
  },
  {
    label: "TypeScript suppression '@ts-expect-error'",
    regex: /@ts-expect-error\b/,
  },
  {
    label: "explicit ': any' type annotation",
    regex: /:\s*any\b/,
  },
  {
    label: "explicit generic '<any>' usage",
    regex: /<\s*any\s*>/,
  },
  {
    label: "explicit 'Array<any>' usage",
    regex: /\bArray<\s*any\s*>/,
  },
  {
    label: "explicit 'Promise<any>' usage",
    regex: /\bPromise<\s*any\s*>/,
  },
  {
    label: "explicit 'Record<..., any>' usage",
    regex: /\bRecord<[^>\n]+,\s*any\s*>/,
  },
];

const UNSAFE_AUTOMATION_KILL_PATTERN_RULES = [
  {
    label: "broad automation process kill via 'pkill -f'",
    regex: /\bpkill\s+-f\b/,
  },
  {
    label: "broad automation process kill via 'killall'",
    regex: /\bkillall\b/,
  },
];

const HIGH_CONFIDENCE_SECRET_TOKEN_RULES = [
  {
    label: "AWS access key id",
    regex: /\b(?:A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    label: "GitHub token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g,
  },
  {
    label: "OpenAI API key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    label: "Slack token",
    regex: /\bxox[abprs]-[0-9A-Za-z-]{20,}\b/g,
  },
  {
    label: "Stripe live secret key",
    regex: /\bsk_live_[0-9A-Za-z]{20,}\b/g,
  },
  {
    label: "private key block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
];

const PINNED_GITHUB_ACTION_REF_PATTERN = /^[a-f0-9]{40}$/;

const GENERATED_OUTPUT_PATH_PREFIXES = [
  "artifacts/",
  "coverage/",
  "dist-local/",
  "output/",
  "uploads/",
  "var/",
];

function normalizeRepoPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function getRepoPathBasename(filePath) {
  const normalizedPath = normalizeRepoPath(filePath);
  return normalizedPath.split("/").pop() || "";
}

function isAllowedSecretValue(rawValue) {
  const value = String(rawValue || "")
    .trim()
    .replace(/[;,]\s*$/g, "")
    .replace(/^['"`]|['"`]$/g, "");
  return ALLOWED_SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function findPotentialCommittedSmtpSecrets(params) {
  const filePath = String(params?.filePath || "");
  const text = String(params?.text || "");
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const envMatch = line.match(/^\s*(SMTP_PASS(?:WORD)?)\s*[:=]\s*(.+?)\s*$/i);
    if (envMatch && !isAllowedSecretValue(envMatch[2])) {
      findings.push(`${filePath}:${index + 1} potential committed SMTP secret via ${envMatch[1]}`);
    }
  }

  if (/createTransport\s*\(/i.test(text)) {
    const transportAuthLiteralPattern = /\bpass\s*:\s*(['"`])([^'"`]+)\1/gi;
    let match;
    while ((match = transportAuthLiteralPattern.exec(text)) !== null) {
      const value = match[2];
      if (isAllowedSecretValue(value)) {
        continue;
      }
      findings.push(`${filePath} potential hardcoded nodemailer auth.pass literal`);
    }
  }

  return findings;
}

export function findForbiddenTypeScriptTypeSafetyPatterns(params) {
  const filePath = String(params?.filePath || "");
  const text = String(params?.text || "");
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    for (const rule of FORBIDDEN_TYPESCRIPT_PATTERN_RULES) {
      if (
        (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"))
        && !/@ts-ignore\b|@ts-expect-error\b/.test(trimmed)
      ) {
        continue;
      }
      if (rule.regex.test(line)) {
        findings.push(`${filePath}:${index + 1} ${rule.label}`);
      }
    }
  }

  return findings;
}

export function findUnsafeAutomationKillPatterns(params) {
  const filePath = String(params?.filePath || "");
  const normalizedFilePath = normalizeRepoPath(filePath);
  const text = String(params?.text || "");
  const findings = [];

  if (!/^(?:\.github\/workflows\/|scripts\/(?!lib\/|tests\/)).+\.(?:ya?ml|[cm]?js|sh)$/i.test(normalizedFilePath)) {
    return findings;
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    for (const rule of UNSAFE_AUTOMATION_KILL_PATTERN_RULES) {
      if (rule.regex.test(line)) {
        findings.push(`${filePath}:${index + 1} ${rule.label}`);
      }
    }
  }

  return findings;
}

export function findHighConfidenceSecretTokens(params) {
  const filePath = String(params?.filePath || "");
  const text = String(params?.text || "");
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const rule of HIGH_CONFIDENCE_SECRET_TOKEN_RULES) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        findings.push(`${filePath}:${index + 1} potential committed ${rule.label}`);
      }
    }
  }

  return findings;
}

export function findUnpinnedGithubActions(params) {
  const filePath = normalizeRepoPath(params?.filePath || "");
  const text = String(params?.text || "");
  if (!/^\.github\/workflows\/.+\.ya?ml$/i.test(filePath)) {
    return [];
  }

  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/\buses:\s*([^@\s]+)@([^\s#]+)/);
    if (!match) {
      continue;
    }

    const actionRef = String(match[2] || "").trim();
    if (!PINNED_GITHUB_ACTION_REF_PATTERN.test(actionRef)) {
      findings.push(`${filePath}:${index + 1} GitHub Action ${match[1]} is not pinned to a full commit SHA`);
    }
  }

  return findings;
}

export function findTrackedGeneratedOutputs(params) {
  const trackedFiles = Array.isArray(params?.trackedFiles) ? params.trackedFiles : [];

  return trackedFiles
    .map((filePath) => normalizeRepoPath(filePath).trim())
    .filter(Boolean)
    .filter((filePath) =>
      GENERATED_OUTPUT_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix)),
    );
}

export function findTrackedForbiddenEnvFiles(params) {
  const trackedFiles = Array.isArray(params?.trackedFiles) ? params.trackedFiles : [];

  return trackedFiles
    .map((filePath) => normalizeRepoPath(filePath).trim())
    .filter(Boolean)
    .filter((filePath) => {
      const basename = getRepoPathBasename(filePath);
      return (basename === ".env" || basename.startsWith(".env."))
        && basename !== ".env.example";
    });
}
