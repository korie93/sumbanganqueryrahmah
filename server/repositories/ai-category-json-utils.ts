import { safeJsonParse } from "../lib/safe-json";

const AI_CATEGORY_JSON_MAX_BYTES = 256 * 1024;

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parseResult = safeJsonParse<unknown>(
        value,
        "ai_category_json_object",
        {
          maxDepth: 12,
          maxObjectKeys: 1_000,
          maxRawBytes: AI_CATEGORY_JSON_MAX_BYTES,
          maxStringLength: 100_000,
          maxTotalBytes: AI_CATEGORY_JSON_MAX_BYTES,
        },
      );
      if (!parseResult.success) {
        return {};
      }
      const parsed = parseResult.data;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function normalizeRuleArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter((entry) => entry.trim().length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((entry) => entry.replace(/^\"|\"$/g, "").trim())
        .filter((entry) => entry.length > 0);
    }
    return [trimmed];
  }

  return [];
}

export function parseJsonData(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parseResult = safeJsonParse<unknown>(
        value,
        "ai_category_json_data",
        {
          maxDepth: 12,
          maxObjectKeys: 1_000,
          maxRawBytes: AI_CATEGORY_JSON_MAX_BYTES,
          maxStringLength: 100_000,
          maxTotalBytes: AI_CATEGORY_JSON_MAX_BYTES,
        },
      );
      if (!parseResult.success) {
        return {};
      }
      const parsed = parseResult.data;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return {};
}
