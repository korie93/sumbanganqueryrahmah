const DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";

const REDACT_KEYS = [
  "password",
  "passwordhash",
  "token",
  "authorization",
  "sessionsecret",
  "icnumber",
  "accountnumber",
  "fingerprint",
  "email",
  "fullname",
  "creditcard",
  "bankaccount",
  "secretkey",
  "apikey",
  "accesstoken",
  "refreshtoken",
];

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (REDACT_KEYS.some((sensitive) => normalizedKey.includes(sensitive))) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitize(nested);
  }
  return output;
}

function log(level: "info" | "warn" | "error" | "debug", message: string, meta?: Record<string, unknown>) {
  if (level === "debug" && !DEBUG_LOGS) return;
  const payload = meta ? sanitize(meta) : undefined;
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    log("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    log("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    log("error", message, meta);
  },
  debug(message: string, meta?: Record<string, unknown>) {
    log("debug", message, meta);
  },
};
