import type { AiIntent } from "./ai-search-types";
import type { AiSearchJsonRecord } from "./ai-search-query-shared";
import { safeJsonParse } from "../lib/safe-json";

const AI_INTENT_JSON_MAX_BYTES = 32 * 1024;

export function parseIntentFallback(query: string): AiIntent {
  const digits = query.match(/\d{6,}/g) || [];
  const ic = digits.find((value) => value.length === 12) || null;
  const account = digits.find((value) => value.length >= 10 && value.length <= 16) || null;
  const phone = digits.find((value) => value.length >= 9 && value.length <= 11) || null;
  const needBranch = /cawangan|branch|terdekat|nearest|lokasi|alamat/i.test(query);
  const name = needBranch ? null : ic ? null : query.trim();

  return {
    intent: "search_person",
    entities: {
      name,
      ic,
      account_no: account,
      phone,
      address: null,
      count_groups: null,
    },
    need_nearest_branch: needBranch,
  };
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  try {
    const parseResult = safeJsonParse<Record<string, unknown>>(
      text.slice(first, last + 1),
      "ai_intent_json_object",
      {
        maxDepth: 8,
        maxObjectKeys: 80,
        maxRawBytes: AI_INTENT_JSON_MAX_BYTES,
        maxStringLength: 4_096,
        maxTotalBytes: AI_INTENT_JSON_MAX_BYTES,
      },
    );
    if (!parseResult.success) {
      return null;
    }
    const parsed = parseResult.data;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ""))
    .filter((token) => token.length >= 3);
}

export function buildFieldMatchSummary(data: AiSearchJsonRecord, query: string): string[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return [];
  }

  const matches: Array<{ key: string; value: string; score: number }> = [];
  for (const [key, value] of Object.entries(data).slice(0, 80)) {
    if (key === "id") continue;
    const valueStr = String(value ?? "");
    const valueLower = valueStr.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (valueLower.includes(token)) score += 1;
    }
    if (score > 0) {
      matches.push({ key, value: valueStr, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((match) => `${match.key}: ${match.value}`);
}
