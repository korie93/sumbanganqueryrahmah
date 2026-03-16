import { tokenizeQuery, toObjectJson } from "./ai-search-query-utils";
import type {
  AiFuzzySearchRow,
  AiIntent,
  AiSearchAudit,
  AiSearchCandidateRow,
} from "./ai-search-types";
import type { AiResolvedBranch } from "./ai-search-branch-utils";

export type AiSearchPersonPayload = ({ id: string } & Record<string, unknown>) | null;

export type AiNearestBranchPayload = {
  name: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  business_hour: string | null;
  day_open: string | null;
  atm_cdm: string | null;
  inquiry_availability: string | null;
  application_availability: string | null;
  aeon_lounge: string | null;
  distance_km: number | null | undefined;
  travel_mode: string | null;
  estimated_minutes: number | null;
} | null;

export type AiSearchPayloadShape = {
  person: AiSearchPersonPayload;
  nearest_branch: AiNearestBranchPayload;
  decision: string | null;
  ai_explanation: string;
};

export function buildAiSuggestions(query: string, fuzzyResults: AiFuzzySearchRow[]): string[] {
  const tokens = tokenizeQuery(query);
  const maxScore = Math.max(1, tokens.length);

  return fuzzyResults
    .map((row) => {
      const data = toObjectJson(row.jsonDataJsonb) || {};

      const name = data["Nama"] || data["Customer Name"] || data["name"] || "-";
      const ic = data["No. MyKad"] || data["ID No"] || data["No Pengenalan"] || data["IC"] || "-";
      const addr =
        data["Alamat Surat Menyurat"] || data["HomeAddress1"] || data["Address"] || data["Alamat"] || "-";
      const confidence = Math.min(100, Math.round((Number(row.score || 0) / maxScore) * 100));
      const hasAny = [name, ic, addr].some(
        (value) => value && value !== "-" && String(value).trim() !== "",
      );

      return hasAny ? `- ${name} | IC: ${ic} | Alamat: ${addr} | Keyakinan: ${confidence}%` : "";
    })
    .filter(Boolean);
}

export function mapAiSearchPerson(best: AiSearchCandidateRow | null): AiSearchPersonPayload {
  if (!best) {
    return null;
  }

  return {
    id: best.rowId,
    ...(best.jsonDataJsonb as Record<string, unknown>),
  };
}

export function mapAiNearestBranchPayload(
  nearestBranch: AiResolvedBranch | null,
  travelMode: string | null,
  estimatedMinutes: number | null,
): AiNearestBranchPayload {
  if (!nearestBranch) {
    return null;
  }

  return {
    name: nearestBranch.name,
    address: nearestBranch.address,
    phone: nearestBranch.phone,
    fax: nearestBranch.fax,
    business_hour: nearestBranch.businessHour,
    day_open: nearestBranch.dayOpen,
    atm_cdm: nearestBranch.atmCdm,
    inquiry_availability: nearestBranch.inquiryAvailability,
    application_availability: nearestBranch.applicationAvailability,
    aeon_lounge: nearestBranch.aeonLounge,
    distance_km: nearestBranch.distanceKm,
    travel_mode: travelMode,
    estimated_minutes: estimatedMinutes,
  };
}

export function buildAiSearchPayload(params: {
  person: AiSearchPersonPayload;
  nearestBranch: AiResolvedBranch | null;
  decision: string | null;
  explanation: string;
  travelMode: string | null;
  estimatedMinutes: number | null;
}): AiSearchPayloadShape {
  return {
    person: params.person,
    nearest_branch: mapAiNearestBranchPayload(
      params.nearestBranch,
      params.travelMode,
      params.estimatedMinutes,
    ),
    decision: params.decision,
    ai_explanation: params.explanation,
  };
}

export function buildAiSearchAudit(params: {
  query: string;
  intent: AiIntent;
  person: AiSearchPersonPayload;
  nearestBranch: AiResolvedBranch | null;
  decision: string | null;
  travelMode: string | null;
  estimatedMinutes: number | null;
  usedLastPerson: boolean;
}): AiSearchAudit {
  return {
    query: params.query,
    intent: params.intent,
    matched_profile_id: params.person?.id || null,
    branch: params.nearestBranch?.name || null,
    distance_km: params.nearestBranch?.distanceKm || null,
    decision: params.decision,
    travel_mode: params.travelMode,
    estimated_minutes: params.estimatedMinutes,
    used_last_person: params.usedLastPerson,
  };
}
