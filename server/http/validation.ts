import { z } from "zod";
import { ERROR_CODES } from "../../shared/error-codes";
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

export function readPositivePage(value: unknown, fallback: number): number {
  return Math.max(1, readInteger(value, fallback));
}

export function readBoundedPageSize(
  value: unknown,
  fallback: number,
  max: number,
): number {
  return clampInteger(readInteger(value, fallback), 1, Math.max(1, Math.trunc(max)));
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

export function readDate(value: unknown): Date | undefined {
  const normalized = readNonEmptyString(value);
  if (!normalized) return undefined;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}
