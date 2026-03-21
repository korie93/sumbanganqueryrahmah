import pino from "pino";
import { getRequestIdFromContext } from "./request-context";

const DEBUG_LOGS = String(process.env.DEBUG_LOGS || "0") === "1";
const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL || (DEBUG_LOGS ? "debug" : "info");

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
  if (value instanceof Error) {
    return sanitize({
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

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

const rootLogger = pino({
  level: DEFAULT_LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

type LogLevel = "info" | "warn" | "error" | "debug";

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const requestId = getRequestIdFromContext();
  const payload = meta ? sanitize(meta) : undefined;
  const hasPayload =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length > 0;

  if (hasPayload) {
    const withRequestId = requestId
      ? { requestId, ...(payload as Record<string, unknown>) }
      : (payload as Record<string, unknown>);
    rootLogger[level](withRequestId, message);
    return;
  }

  if (requestId) {
    rootLogger[level]({ requestId }, message);
    return;
  }

  rootLogger[level](message);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    write("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    write("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    write("error", message, meta);
  },
  debug(message: string, meta?: Record<string, unknown>) {
    write("debug", message, meta);
  },
};
