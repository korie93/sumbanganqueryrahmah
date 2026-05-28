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
  "userid",
  "username",
  "login",
];

const ALLOWED_LOG_KEYS = new Set([
  "action",
  "app",
  "attempt",
  "attemptcount",
  "capturedat",
  "bucketcount",
  "category",
  "channel",
  "classification",
  "clientip",
  "code",
  "contentlength",
  "count",
  "cwd",
  "database",
  "delta",
  "details",
  "diagnostics",
  "durationms",
  "effectiveconnectiontype",
  "elapsedms",
  "enabled",
  "envnames",
  "error",
  "event",
  "expected",
  "feature",
  "foundpath",
  "fullpath",
  "host",
  "httpmethod",
  "httppath",
  "idle",
  "inflight",
  "infologsamplerate",
  "label",
  "lanurl",
  "limit",
  "localurl",
  "max",
  "maxworkers",
  "message",
  "metadata",
  "method",
  "metric",
  "metricid",
  "mode",
  "name",
  "navigationtype",
  "operation",
  "page",
  "pagetype",
  "path",
  "phase",
  "pid",
  "port",
  "provider",
  "payloadlength",
  "rating",
  "ready",
  "reason",
  "recordedsamplecount",
  "remaining",
  "remainingcount",
  "requestid",
  "responsesize",
  "retryable",
  "retryafterms",
  "savedata",
  "severity",
  "signal",
  "source",
  "stack",
  "status",
  "statuscode",
  "step",
  "strikecount",
  "summary",
  "suppressedafter",
  "removedcount",
  "sweepactive",
  "total",
  "trustedproxies",
  "type",
  "useragent",
  "value",
  "visibilitystate",
  "waiting",
  "warningcount",
  "warnings",
  "workerid",
  "workerpid",
]);

function normalizeSensitiveLogKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveLogKey(key: string): boolean {
  const normalizedKey = normalizeSensitiveLogKey(key);
  return REDACT_KEYS.some((sensitive) => normalizedKey.includes(sensitive));
}

function isAllowedLogKey(key: string): boolean {
  return ALLOWED_LOG_KEYS.has(normalizeSensitiveLogKey(key));
}

const EMAIL_CANDIDATE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_CANDIDATE_PATTERN = /(?<!\d)(?:\+?60|0)(?:1(?:[ -]?\d){8,9}|[3-9](?:[ -]?\d){7,8})(?!\d)/g;
const CREDIT_CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const PRODUCTION_STACK_MAX_LINES = 4;
const PRODUCTION_STACK_MAX_CHARS = 1_200;

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
  const withBearerTokensRedacted = value.replace(BEARER_TOKEN_PATTERN, "[REDACTED]");
  const withEmailAddressesRedacted = withBearerTokensRedacted.replace(EMAIL_CANDIDATE_PATTERN, "[REDACTED]");
  const withPhoneNumbersRedacted = withEmailAddressesRedacted.replace(PHONE_CANDIDATE_PATTERN, "[REDACTED]");

  return withPhoneNumbersRedacted.replace(CREDIT_CARD_CANDIDATE_PATTERN, (candidate) => {
    const trailingSeparator = candidate.match(/[ -]+$/)?.[0] ?? "";
    const normalizedCandidate = trailingSeparator
      ? candidate.slice(0, -trailingSeparator.length)
      : candidate;
    const digits = normalizedCandidate.replace(/\D/g, "");
    return passesLuhnCheck(digits) ? `[REDACTED]${trailingSeparator}` : candidate;
  });
}

export function sanitizeErrorStackForLog(
  stack: string | undefined,
  options: { productionLike?: boolean } = {},
): string | undefined {
  if (!stack) {
    return undefined;
  }

  const sanitizedStack = sanitizeLogString(stack);
  const productionLike = options.productionLike ?? runtimeConfig.app.isProductionLike;
  if (!productionLike) {
    return sanitizedStack;
  }

  const lines = sanitizedStack
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const visibleLines = lines.slice(0, PRODUCTION_STACK_MAX_LINES);
  let truncatedStack = visibleLines.join("\n");
  const omittedLineCount = Math.max(0, lines.length - visibleLines.length);

  if (truncatedStack.length > PRODUCTION_STACK_MAX_CHARS) {
    truncatedStack = truncatedStack.slice(0, PRODUCTION_STACK_MAX_CHARS).trimEnd();
  }

  if (
    omittedLineCount === 0
    && truncatedStack.length === sanitizedStack.length
  ) {
    return truncatedStack;
  }

  const notice = omittedLineCount > 0
    ? `[stack truncated for production log: ${omittedLineCount} additional line(s) omitted]`
    : "[stack truncated for production log]";

  return `${truncatedStack}\n${notice}`;
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
    if (key === "stack" && typeof nested === "string") {
      output[key] = sanitizeErrorStackForLog(nested);
      continue;
    }
    output[key] = sanitizeForLog(nested);
  }
  return output;
}

export function sanitizeForLogAllowList(value: unknown): unknown {
  if (value instanceof Error) {
    return sanitizeForLogAllowList({
      code: "code" in value ? (value as Error & { code?: unknown }).code : undefined,
      message: value.message,
      name: value.name,
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
    return value.map((item) => sanitizeForLogAllowList(item));
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
    if (!isAllowedLogKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    if (key === "stack" && typeof nested === "string") {
      output[key] = sanitizeErrorStackForLog(nested);
      continue;
    }
    output[key] = sanitizeForLogAllowList(nested);
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
  const payload = meta ? sanitizeForLogAllowList(meta) : undefined;
  const hasPayload =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length > 0;
  const contextPayload = requestContext
    ? sanitizeForLogAllowList({
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
