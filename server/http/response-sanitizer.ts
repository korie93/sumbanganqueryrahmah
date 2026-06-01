import type { RequestHandler, Response } from "express";
import { sensitiveResponseFieldBlocklist } from "../../shared/api-contracts";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { logger as defaultLogger } from "../lib/logger";

type ResponseSanitizerLogger = {
  warn: (message: string, metadata?: Record<string, unknown>) => void;
};

type SanitizedResponseValue = {
  changed: boolean;
  removedCount: number;
  value: unknown;
};

type SensitiveApiResponseSanitizerOptions = {
  logger?: ResponseSanitizerLogger;
  metrics?: InternalMetricsRecorder;
};

function normalizeResponseFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SENSITIVE_RESPONSE_FIELD_NAMES = new Set(
  sensitiveResponseFieldBlocklist.map((fieldName) => normalizeResponseFieldName(fieldName)),
);

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isSensitiveResponseFieldName(fieldName: string): boolean {
  return SENSITIVE_RESPONSE_FIELD_NAMES.has(normalizeResponseFieldName(fieldName));
}

function stripSensitiveResponseFieldsInternal(
  value: unknown,
  activeObjects: WeakSet<object>,
): SanitizedResponseValue {
  if (!value || typeof value !== "object") {
    return { changed: false, removedCount: 0, value };
  }

  if (value instanceof Date || !Array.isArray(value) && !isPlainObject(value)) {
    return { changed: false, removedCount: 0, value };
  }

  if (activeObjects.has(value)) {
    return { changed: false, removedCount: 0, value };
  }

  activeObjects.add(value);

  if (Array.isArray(value)) {
    let changed = false;
    let removedCount = 0;
    const sanitizedItems = value.map((item) => {
      const result = stripSensitiveResponseFieldsInternal(item, activeObjects);
      changed = changed || result.changed;
      removedCount += result.removedCount;
      return result.value;
    });
    activeObjects.delete(value);

    return {
      changed,
      removedCount,
      value: changed ? sanitizedItems : value,
    };
  }

  let changed = false;
  let removedCount = 0;
  const sanitizedObject: Record<string, unknown> = {};

  for (const [fieldName, nestedValue] of Object.entries(value)) {
    if (isSensitiveResponseFieldName(fieldName)) {
      changed = true;
      removedCount += 1;
      continue;
    }

    const result = stripSensitiveResponseFieldsInternal(nestedValue, activeObjects);
    changed = changed || result.changed;
    removedCount += result.removedCount;
    sanitizedObject[fieldName] = result.value;
  }

  activeObjects.delete(value);

  return {
    changed,
    removedCount,
    value: changed ? sanitizedObject : value,
  };
}

export function stripSensitiveResponseFields(value: unknown): {
  removedCount: number;
  value: unknown;
} {
  const result = stripSensitiveResponseFieldsInternal(value, new WeakSet<object>());
  return {
    removedCount: result.removedCount,
    value: result.value,
  };
}

export function createSensitiveApiResponseSanitizerMiddleware(
  options: SensitiveApiResponseSanitizerOptions = {},
): RequestHandler {
  const metrics = options.metrics ?? internalMetrics;
  const sink = options.logger ?? defaultLogger;

  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = ((body?: unknown) => {
      const sanitized = stripSensitiveResponseFields(body);

      if (sanitized.removedCount > 0) {
        metrics.increment("apiResponseSensitiveFieldsStrippedTotal", sanitized.removedCount);
        sink.warn("API response sanitizer stripped sensitive fields", {
          event: "api_response_sensitive_fields_stripped",
          method: req.method,
          path: req.path,
          removedCount: sanitized.removedCount,
        });
      }

      return originalJson(sanitized.value);
    }) as Response["json"];

    next();
  };
}
