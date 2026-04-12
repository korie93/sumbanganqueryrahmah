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

const PHONE_CANDIDATE_PATTERN = /(?<!\d)(?:\+?60|0)(?:1(?:[ -]?\d){8,9}|[3-9](?:[ -]?\d){7,8})(?!\d)/g;
const CREDIT_CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

function passesLuhnCheck(rawDigits: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let index = rawDigits.length - 1; index >= 0; index -= 1) {
    const digit = Number(rawDigits[index]);
    if (!Number.isInteger(digit)) {
      return false;
    }

    let value = digit;
    if (shouldDouble) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }

    sum += value;
    shouldDouble = !shouldDouble;
  }

  return rawDigits.length >= 13 && rawDigits.length <= 19 && sum % 10 === 0;
}

function sanitizeLogString(value: string): string {
  const withPhoneNumbersRedacted = value.replace(PHONE_CANDIDATE_PATTERN, "[REDACTED]");

  return withPhoneNumbersRedacted.replace(CREDIT_CARD_CANDIDATE_PATTERN, (candidate) => {
    const trailingSeparator = candidate.match(/[ -]+$/)?.[0] ?? "";
    const normalizedCandidate = trailingSeparator
      ? candidate.slice(0, -trailingSeparator.length)
      : candidate;
    const digits = normalizedCandidate.replace(/\D/g, "");
    return passesLuhnCheck(digits) ? `[REDACTED]${trailingSeparator}` : candidate;
  });
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

  if (typeof value === "string") {
    return sanitizeLogString(value);
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
