import type {
  AiSearchRecordRow,
  BranchRowDb,
  BranchSearchResult,
} from "./ai-repository-types";
import { safeJsonParse } from "../lib/safe-json";

const AI_REPOSITORY_JSON_MAX_BYTES = 256 * 1024;

export function readRows<T>(result: { rows?: unknown[] | null }): T[] {
  return Array.isArray(result.rows) ? (result.rows as T[]) : [];
}

export function normalizeJsonPayload(value: unknown): unknown {
  let next = value;

  if (typeof next === "string") {
    try {
      const parseResult = safeJsonParse<unknown>(
        next,
        "ai_repository_json_payload",
        {
          maxDepth: 12,
          maxObjectKeys: 1_000,
          maxRawBytes: AI_REPOSITORY_JSON_MAX_BYTES,
          maxStringLength: 100_000,
          maxTotalBytes: AI_REPOSITORY_JSON_MAX_BYTES,
        },
      );
      if (!parseResult.success) {
        return next;
      }
      next = parseResult.data;
    } catch {
      return next;
    }
  }

  return next;
}

export function mapSearchRow<T extends AiSearchRecordRow>(row: T): T {
  return {
    ...row,
    jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
  };
}

export function mapBranchRow(row: BranchRowDb): BranchSearchResult {
  return {
    name: row.name,
    address: row.branch_address ?? null,
    phone: row.phone_number ?? null,
    fax: row.fax_number ?? null,
    businessHour: row.business_hour ?? null,
    dayOpen: row.day_open ?? null,
    atmCdm: row.atm_cdm ?? null,
    inquiryAvailability: row.inquiry_availability ?? null,
    applicationAvailability: row.application_availability ?? null,
    aeonLounge: row.aeon_lounge ?? null,
  };
}
