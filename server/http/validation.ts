import { z } from "zod";
import { ERROR_CODES } from "../../shared/error-codes";
import { PAGE_LIMIT_MIN_ERROR_MESSAGE } from "../../shared/pagination-contracts";
import { badRequest } from "./errors";

export function ensureObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export type RequestValidationIssue = {
  code: string;
  message: string;
  path: string;
};

function buildRequestValidationIssues(error: z.ZodError): RequestValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.map(String).join(".") : "body",
  }));
}

export function parseRequestBody<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const details = buildRequestValidationIssues(parsed.error);
  throw badRequest(
    details[0]?.message || "Request body is invalid.",
    ERROR_CODES.REQUEST_BODY_INVALID,
    details,
  );
}

export const DEFAULT_READ_STRING_MAX_LENGTH = 2_048;

export function readNonEmptyString(
  value: unknown,
  maxLength = DEFAULT_READ_STRING_MAX_LENGTH,
): string {
  const normalized = String(value ?? "").trim();
  if (normalized.length > maxLength) {
    throw badRequest(
      `String value exceeds maximum length of ${maxLength} characters.`,
      ERROR_CODES.REQUEST_BODY_INVALID,
    );
  }
  return normalized;
}

export function readRouteParam(
  value: unknown,
  name = "Route parameter",
  maxLength = DEFAULT_READ_STRING_MAX_LENGTH,
): string {
  if (Array.isArray(value)) {
    throw badRequest(
      `${name} must be a single path segment.`,
      ERROR_CODES.INVALID_IDENTIFIER,
    );
  }

  const normalized = readNonEmptyString(value, maxLength);
  if (!normalized) {
    throw badRequest(`${name} is required.`, ERROR_CODES.INVALID_IDENTIFIER);
  }
  return normalized;
}

export function readOptionalString(
  value: unknown,
  maxLength = DEFAULT_READ_STRING_MAX_LENGTH,
): string | undefined {
  const normalized = readNonEmptyString(value, maxLength);
  return normalized || undefined;
}

export function readInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function readPageLimit(
  value: unknown,
  fallback: number,
  max = Number.POSITIVE_INFINITY,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = typeof candidate === "string" ? candidate.trim() : candidate;
  const safeMax = Number.isFinite(max)
    ? Math.max(1, Math.trunc(max))
    : Number.POSITIVE_INFINITY;
  const safeFallback = Math.min(
    safeMax,
    Math.max(1, Number.isFinite(fallback) ? Math.trunc(fallback) : 1),
  );

  if (normalized == null || normalized === "") {
    return safeFallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }

  const limit = Math.trunc(parsed);
  if (limit < 1) {
    throw badRequest(PAGE_LIMIT_MIN_ERROR_MESSAGE, ERROR_CODES.REQUEST_BODY_INVALID);
  }

  return Math.min(safeMax, limit);
}

const TRUTHY_BOOLEAN_LITERALS = new Set(["1", "true", "yes", "on"]);
const FALSY_BOOLEAN_LITERALS = new Set(["0", "false", "no", "off"]);

export function readBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = readNonEmptyString(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (TRUTHY_BOOLEAN_LITERALS.has(normalized)) {
    return true;
  }

  if (FALSY_BOOLEAN_LITERALS.has(normalized)) {
    return false;
  }

  throw badRequest(
    "Boolean flag must be one of: true, false, 1, 0, yes, no, on, off.",
    ERROR_CODES.REQUEST_BODY_INVALID,
  );
}

function parseEscapedStringList(value: string): string[] {
  const values: string[] = [];
  let current = "";
  let escaping = false;

  for (const character of value) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (character === ",") {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += "\\";
  }

  values.push(current);
  return values;
}

export function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => readNonEmptyString(item))
      .filter(Boolean);
  }

  const normalized = readNonEmptyString(value);
  if (!normalized) return [];

  return parseEscapedStringList(normalized)
    .map((part) => readNonEmptyString(part))
    .filter(Boolean);
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?$/;

function isValidIsoDateParts(year: number, month: number, day: number): boolean {
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

function isStrictIsoDateOrDateTime(value: string): boolean {
  const dateMatch = ISO_DATE_PATTERN.exec(value);
  const dateTimeMatch = dateMatch ? null : ISO_DATETIME_PATTERN.exec(value);
  const match = dateMatch || dateTimeMatch;
  if (!match) {
    return false;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!isValidIsoDateParts(year, month, day)) {
    return false;
  }

  if (!dateTimeMatch) {
    return true;
  }

  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = secondRaw == null ? 0 : Number(secondRaw);
  return (
    Number.isInteger(hour)
    && hour >= 0
    && hour <= 23
    && Number.isInteger(minute)
    && minute >= 0
    && minute <= 59
    && Number.isInteger(second)
    && second >= 0
    && second <= 59
  );
}

export function readDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value.getTime());
  }

  const normalized = readNonEmptyString(value);
  if (!normalized) return undefined;

  if (!isStrictIsoDateOrDateTime(normalized)) {
    throw badRequest(
      "Date value must be an ISO 8601 date or datetime, for example 2026-01-01 or 2026-01-01T00:00:00.000Z.",
      ERROR_CODES.REQUEST_BODY_INVALID,
    );
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(
      "Date value must be a valid ISO 8601 date or datetime.",
      ERROR_CODES.REQUEST_BODY_INVALID,
    );
  }

  return parsed;
}
