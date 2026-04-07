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
