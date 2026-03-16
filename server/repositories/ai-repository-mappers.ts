import type {
  AiSearchRecordRow,
  BranchRowDb,
  BranchSearchResult,
} from "./ai-repository-types";

export function readRows<T>(result: { rows?: unknown[] | null }): T[] {
  return Array.isArray(result.rows) ? (result.rows as T[]) : [];
}

export function normalizeJsonPayload(value: unknown): unknown {
  let next = value;

  if (typeof next === "string") {
    try {
      next = JSON.parse(next);
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
