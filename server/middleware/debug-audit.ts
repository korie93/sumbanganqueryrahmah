import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../lib/logger";

const MAX_DEBUG_AUDIT_FIELD_LENGTH = 512;
const MAX_DEBUG_AUDIT_PATH_LENGTH = 1024;
const MAX_DEBUG_AUDIT_QUERY_LENGTH = 4096;
const MAX_DEBUG_AUDIT_QUERY_DEPTH = 3;
const MAX_DEBUG_AUDIT_QUERY_KEYS = 50;
const MAX_DEBUG_AUDIT_QUERY_ARRAY_ITEMS = 20;
const SENSITIVE_QUERY_KEY_PATTERN = /authorization|cookie|password|secret|token|key/i;

type RequestWithUser = Request & {
  user?: {
    id?: unknown;
    userId?: unknown;
  } | undefined;
};

export type DebugAuditEntry = {
  readonly timestamp: Date;
  readonly userId: string | null;
  readonly ipAddress: string | null;
  readonly method: string;
  readonly path: string;
  readonly userAgent: string | null;
  readonly queryParams: string;
};

export type DebugAuditInsert = (entry: DebugAuditEntry) => Promise<unknown> | unknown;

function truncateDebugAuditField(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function readHeaderString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function readDebugAuditUserId(req: Request) {
  const user = (req as RequestWithUser).user;
  const candidate = user?.id ?? user?.userId;
  return typeof candidate === "string" && candidate.trim()
    ? truncateDebugAuditField(candidate.trim(), MAX_DEBUG_AUDIT_FIELD_LENGTH)
    : null;
}

function sanitizeQueryValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEBUG_AUDIT_QUERY_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateDebugAuditField(value, MAX_DEBUG_AUDIT_FIELD_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_DEBUG_AUDIT_QUERY_ARRAY_ITEMS)
      .map((item) => sanitizeQueryValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value).slice(0, MAX_DEBUG_AUDIT_QUERY_KEYS)) {
      output[key] = SENSITIVE_QUERY_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : sanitizeQueryValue(nested, depth + 1);
    }
    return output;
  }

  return String(value);
}

export function serializeDebugAuditQueryParams(query: Request["query"]) {
  try {
    return truncateDebugAuditField(
      JSON.stringify(sanitizeQueryValue(query)) || "{}",
      MAX_DEBUG_AUDIT_QUERY_LENGTH,
    );
  } catch {
    return "{\"error\":\"unserializable_query\"}";
  }
}

export async function insertDebugAuditLog(entry: DebugAuditEntry) {
  const [{ db }, { debugAuditLogs }] = await Promise.all([
    import("../db-postgres"),
    import("../../shared/schema-postgres"),
  ]);

  await db.insert(debugAuditLogs).values(entry);
}

export function createDebugAuditMiddleware(options: {
  readonly insert?: DebugAuditInsert;
} = {}): RequestHandler {
  const insert = options.insert ?? insertDebugAuditLog;

  return (req: Request, _res: Response, next: NextFunction) => {
    const userAgent = readHeaderString(req.headers["user-agent"]);
    const entry: DebugAuditEntry = {
      timestamp: new Date(),
      userId: readDebugAuditUserId(req),
      ipAddress: truncateDebugAuditField(
        String(req.ip || req.socket.remoteAddress || "unknown"),
        MAX_DEBUG_AUDIT_FIELD_LENGTH,
      ),
      method: truncateDebugAuditField(req.method, 16),
      path: truncateDebugAuditField(req.path || req.originalUrl || "unknown", MAX_DEBUG_AUDIT_PATH_LENGTH),
      userAgent: userAgent
        ? truncateDebugAuditField(userAgent, MAX_DEBUG_AUDIT_FIELD_LENGTH)
        : null,
      queryParams: serializeDebugAuditQueryParams(req.query),
    };

    // Future alert rule: flag repeated debug_audit_log entries above the
    // operations threshold per IP/hour in monitoring, without blocking requests.
    void Promise.resolve().then(() => insert(entry)).catch((error: unknown) => {
      logger.error("Debug audit log write failed", {
        event: "debug_audit_log_write_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });

    next();
  };
}
