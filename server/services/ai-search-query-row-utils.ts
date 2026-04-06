import type { AiSearchJsonRecord, AiSearchRowLike } from "./ai-search-query-shared";
import { toObjectJson } from "./ai-search-query-shared";

function normalizeToObject(value: unknown): AiSearchJsonRecord {
  if (value && typeof value === "object") {
    return value as AiSearchJsonRecord;
  }
  return {};
}

export function rowScore(
  row: AiSearchRowLike,
  ic?: string | null,
  name?: string | null,
  account?: string | null,
  phone?: string | null,
): number {
  const data = normalizeToObject(row.jsonDataJsonb);
  let score = 0;
  const icDigits = ic ? ic.replace(/\D/g, "") : "";
  const accountDigits = account ? account.replace(/\D/g, "") : "";
  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";

  for (const [key, value] of Object.entries(data).slice(0, 80)) {
    const keyLower = key.toLowerCase();
    const valueStr = String(value ?? "");
    const valueDigits = valueStr.replace(/\D/g, "");

    if (icDigits && valueDigits === icDigits) {
      score +=
        keyLower.includes("ic") ||
        keyLower.includes("mykad") ||
        keyLower.includes("nric") ||
        keyLower.includes("kp") ||
        keyLower.includes("id no") ||
        keyLower.includes("idno")
          ? 20
          : 10;
    }
    if (accountDigits && valueDigits === accountDigits) {
      score += keyLower.includes("akaun") || keyLower.includes("account") ? 12 : 6;
    }
    if (phoneDigits && valueDigits === phoneDigits) {
      score +=
        keyLower.includes("telefon") || keyLower.includes("phone") || keyLower.includes("hp")
          ? 8
          : 4;
    }
    if (name && valueStr.toLowerCase().includes(name.toLowerCase())) {
      score += keyLower.includes("nama") || keyLower.includes("name") ? 6 : 2;
    }
  }

  return score;
}

export function scoreRowDigits(
  row: AiSearchRowLike,
  digits: string,
): { score: number; parsed: AiSearchJsonRecord } {
  const data = toObjectJson(row.jsonDataJsonb) || {};

  const keyGroups: Array<{ keys: string[]; score: number }> = [
    { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
    {
      keys: [
        "Account No",
        "Account Number",
        "Card No",
        "No Akaun",
        "Nombor Akaun Bank Pemohon",
      ],
      score: 12,
    },
    {
      keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"],
      score: 8,
    },
  ];

  let best = 0;
  for (const group of keyGroups) {
    for (const key of group.keys) {
      const value = data[key];
      if (!value) continue;
      if (String(value).replace(/\D/g, "") === digits) {
        best = Math.max(best, group.score);
      }
    }
  }

  return { score: best, parsed: data };
}

export function ensureJsonRow<T extends AiSearchRowLike>(row: T): T {
  if (typeof row?.jsonDataJsonb === "string") {
    try {
      row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
    } catch {
      // Keep original string payload for compatibility.
    }
  }
  return row;
}
