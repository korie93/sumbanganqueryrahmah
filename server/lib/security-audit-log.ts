import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuditHmacKey } from "../config/security";
import { getRequestContext } from "./request-context";
import { safeJsonParse } from "./safe-json";

export type SecurityAuditEventType =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_2FA_SUCCESS"
  | "AUTH_2FA_FAILURE"
  | "AUTH_PASSWORD_CHANGED"
  | "AUTH_PASSWORD_RESET_REQUESTED"
  | "AUTH_PASSWORD_RESET_COMPLETED"
  | "AUTH_ACCOUNT_LOCKED"
  | "AUTH_ACCOUNT_UNLOCKED"
  | "AUTH_SESSION_REVOKED"
  | "AUTHZ_PERMISSION_DENIED"
  | "AUTHZ_PRIVILEGE_ESCALATED"
  | "AUTHZ_PERMISSION_CHANGED"
  | "DATA_PII_ACCESSED"
  | "DATA_EXPORT_INITIATED"
  | "DATA_BULK_OPERATION"
  | "CONFIG_DEBUG_ROUTES_ACCESSED"
  | "CONFIG_SETTINGS_CHANGED"
  | "SEC_RATE_LIMIT_TRIGGERED"
  | "SEC_CSRF_VALIDATION_FAILED"
  | "SEC_MALWARE_DETECTED"
  | "SEC_OVERSIZED_REQUEST";

export type SecurityAuditOutcome = "success" | "failure" | "blocked";
export type SecurityAuditMetadataValue = string | number | boolean | null;
export type SecurityAuditMetadata = Readonly<Record<string, SecurityAuditMetadataValue>>;

export type SecurityAuditEntry = {
  readonly schema_version: 1;
  readonly event: SecurityAuditEventType;
  readonly timestamp: string;
  readonly request_id: string | null;
  readonly actor_hash: string | null;
  readonly ip_hash: string | null;
  readonly user_agent: string | null;
  readonly outcome: SecurityAuditOutcome;
  readonly metadata: SecurityAuditMetadata;
  readonly hmac: string;
};

export type SecurityAuditDetails = {
  readonly security_audit: SecurityAuditEntry;
  readonly message?: string;
};

export type BuildSecurityAuditDetailsParams = {
  readonly event: SecurityAuditEventType;
  readonly outcome: SecurityAuditOutcome;
  readonly actorId?: string | null | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly metadata?: SecurityAuditMetadata | undefined;
  readonly message?: string | null | undefined;
  readonly requestId?: string | null | undefined;
  readonly timestamp?: Date | string | undefined;
  readonly userAgent?: string | null | undefined;
};

export type SecurityAuditVerificationResult =
  | { readonly ok: true; readonly entry: SecurityAuditEntry }
  | { readonly ok: false; readonly reason: "missing_entry" | "invalid_json" | "invalid_hmac" | "invalid_shape" };

const SECURITY_AUDIT_SCHEMA_VERSION = 1;
const MAX_SECURITY_AUDIT_STRING_LENGTH = 160;
const MAX_SECURITY_AUDIT_METADATA_KEYS = 30;
const MAX_SECURITY_AUDIT_DETAILS_BYTES = 16 * 1024;
const SECURITY_AUDIT_HASH_PREFIX = "hmac-sha256:";
const SECURITY_AUDIT_FORBIDDEN_METADATA_KEY_PATTERN =
  /(password|passcode|token|secret|session|jwt|cookie|authorization|fingerprint|email|ic|phone|account|name|address)/i;

function getSecurityAuditHmacKey(): string {
  return getAuditHmacKey();
}

function normalizeAuditString(value: unknown): string {
  return Array.from(String(value ?? ""))
    .filter((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("")
    .slice(0, MAX_SECURITY_AUDIT_STRING_LENGTH);
}

function normalizeTimestamp(value: Date | string | undefined): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function createAuditHmac(payload: Omit<SecurityAuditEntry, "hmac">, key = getSecurityAuditHmacKey()): string {
  return createHmac("sha256", key)
    .update(stableStringify(payload))
    .digest("hex");
}

function safeTimingEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashSecurityAuditIdentifier(value: string | null | undefined, key = getSecurityAuditHmacKey()): string | null {
  const normalized = normalizeAuditString(value).trim();
  if (!normalized) {
    return null;
  }

  return `${SECURITY_AUDIT_HASH_PREFIX}${createHmac("sha256", key).update(normalized).digest("hex")}`;
}

export function sanitizeSecurityAuditMetadata(metadata: SecurityAuditMetadata | undefined): SecurityAuditMetadata {
  const sanitized: Record<string, SecurityAuditMetadataValue> = {};
  if (!metadata) {
    return sanitized;
  }

  for (const [rawKey, rawValue] of Object.entries(metadata).slice(0, MAX_SECURITY_AUDIT_METADATA_KEYS)) {
    const key = normalizeAuditString(rawKey).trim();
    if (!key || SECURITY_AUDIT_FORBIDDEN_METADATA_KEY_PATTERN.test(key)) {
      continue;
    }

    if (typeof rawValue === "boolean" || rawValue === null) {
      sanitized[key] = rawValue;
      continue;
    }

    if (typeof rawValue === "number") {
      sanitized[key] = Number.isFinite(rawValue) ? rawValue : null;
      continue;
    }

    sanitized[key] = normalizeAuditString(rawValue);
  }

  return sanitized;
}

export function createSecurityAuditEntry(
  params: BuildSecurityAuditDetailsParams,
  options: { hmacKey?: string | undefined } = {},
): SecurityAuditEntry {
  const requestContext = getRequestContext();
  const payload: Omit<SecurityAuditEntry, "hmac"> = {
    schema_version: SECURITY_AUDIT_SCHEMA_VERSION,
    event: params.event,
    timestamp: normalizeTimestamp(params.timestamp),
    request_id: normalizeAuditString(params.requestId ?? requestContext?.requestId ?? "").trim() || null,
    actor_hash: hashSecurityAuditIdentifier(params.actorId, options.hmacKey),
    ip_hash: hashSecurityAuditIdentifier(params.ipAddress ?? requestContext?.clientIp, options.hmacKey),
    user_agent: normalizeAuditString(params.userAgent ?? requestContext?.userAgent ?? "").trim() || null,
    outcome: params.outcome,
    metadata: sanitizeSecurityAuditMetadata(params.metadata),
  };

  return {
    ...payload,
    hmac: createAuditHmac(payload, options.hmacKey),
  };
}

export function buildSecurityAuditDetails(
  params: BuildSecurityAuditDetailsParams,
  options: { hmacKey?: string | undefined } = {},
): string {
  const details: SecurityAuditDetails = {
    security_audit: createSecurityAuditEntry(params, options),
    ...(params.message ? { message: normalizeAuditString(params.message) } : {}),
  };

  return JSON.stringify(details);
}

function isSecurityAuditEntry(value: unknown): value is SecurityAuditEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SecurityAuditEntry>;
  return (
    candidate.schema_version === SECURITY_AUDIT_SCHEMA_VERSION
    && typeof candidate.event === "string"
    && typeof candidate.timestamp === "string"
    && (typeof candidate.request_id === "string" || candidate.request_id === null)
    && (typeof candidate.actor_hash === "string" || candidate.actor_hash === null)
    && (typeof candidate.ip_hash === "string" || candidate.ip_hash === null)
    && (typeof candidate.user_agent === "string" || candidate.user_agent === null)
    && (candidate.outcome === "success" || candidate.outcome === "failure" || candidate.outcome === "blocked")
    && typeof candidate.metadata === "object"
    && candidate.metadata !== null
    && typeof candidate.hmac === "string"
  );
}

export function verifySecurityAuditEntry(
  entry: SecurityAuditEntry,
  options: { hmacKey?: string | undefined } = {},
): boolean {
  const { hmac, ...payload } = entry;
  const expectedHmac = createAuditHmac(payload, options.hmacKey);
  return safeTimingEqual(hmac, expectedHmac);
}

export function verifySecurityAuditDetails(
  details: string | null | undefined,
  options: { hmacKey?: string | undefined } = {},
): SecurityAuditVerificationResult {
  if (!details) {
    return { ok: false, reason: "missing_entry" };
  }

  let parsed: unknown;
  try {
    const parseResult = safeJsonParse<unknown>(
      details,
      "security_audit_details",
      {
        maxDepth: 6,
        maxObjectKeys: 64,
        maxRawBytes: MAX_SECURITY_AUDIT_DETAILS_BYTES,
        maxStringLength: 512,
        maxTotalBytes: MAX_SECURITY_AUDIT_DETAILS_BYTES,
      },
    );
    if (!parseResult.success) {
      return { ok: false, reason: "invalid_json" };
    }
    parsed = parseResult.data;
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const entry = (parsed as Partial<SecurityAuditDetails>)?.security_audit;
  if (!isSecurityAuditEntry(entry)) {
    return { ok: false, reason: "invalid_shape" };
  }

  if (!verifySecurityAuditEntry(entry, options)) {
    return { ok: false, reason: "invalid_hmac" };
  }

  return { ok: true, entry };
}
