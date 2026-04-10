import pino from "pino";
import { runtimeConfig } from "../config/runtime";
import { getRequestContext } from "./request-context";

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
  "phone",
  "phonenumber",
  "contactnumber",
  "mobilenumber",
  "customerphone",
  "customername",
  "staffname",
  "amount",
  "customernamesearchhash",
  "icnumbersearchhash",
  "customerphonesearchhash",
  "accountnumbersearchhash",
  "creditcard",
  "bankaccount",
  "secretkey",
  "apikey",
  "accesstoken",
  "refreshtoken",
];

function normalizeSensitiveLogKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveLogKey(key: string): boolean {
  const normalizedKey = normalizeSensitiveLogKey(key);
  return REDACT_KEYS.some((sensitive) => normalizedKey.includes(sensitive));
}

export function sanitizeForLog(value: unknown): unknown {
  if (value instanceof Error) {
    return sanitizeForLog({
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveLogKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeForLog(nested);
  }
  return output;
}

const rootLogger = pino({
  level: runtimeConfig.app.logLevel,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

type LogLevel = "info" | "warn" | "error" | "debug";

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const requestContext = getRequestContext();
  const payload = meta ? sanitizeForLog(meta) : undefined;
  const hasPayload =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length > 0;
  const contextPayload = requestContext
    ? sanitizeForLog({
      requestId: requestContext.requestId,
      ...(requestContext.httpMethod ? { httpMethod: requestContext.httpMethod } : {}),
      ...(requestContext.httpPath ? { httpPath: requestContext.httpPath } : {}),
      ...(requestContext.clientIp ? { clientIp: requestContext.clientIp } : {}),
      ...(requestContext.userAgent ? { userAgent: requestContext.userAgent } : {}),
    }) as Record<string, unknown>
    : null;
  const hasContextPayload = contextPayload && Object.keys(contextPayload).length > 0;

  if (hasPayload || hasContextPayload) {
    rootLogger[level]({
      ...(contextPayload || {}),
      ...((payload as Record<string, unknown>) || {}),
    }, message);
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
