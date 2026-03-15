import type { AiSearchJsonRecord } from "./ai-search-query-utils";

export type AiSummaryItem = {
  label: string;
  value: string;
};

export type AiBranchSummarySource = {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  fax?: unknown;
  businessHour?: unknown;
  dayOpen?: unknown;
  atmCdm?: unknown;
  inquiryAvailability?: unknown;
  applicationAvailability?: unknown;
  aeonLounge?: unknown;
  distanceKm?: unknown;
};

export function buildPersonSummary(person: AiSearchJsonRecord | null): AiSummaryItem[] {
  const summary: AiSummaryItem[] = [];
  if (person && typeof person === "object") {
    const pushIf = (label: string, key: string) => {
      const value = person[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        summary.push({ label, value: String(value) });
      }
    };

    pushIf("Nama", "Nama");
    pushIf("Nama", "Customer Name");
    pushIf("Nama", "name");
    pushIf("No. MyKad", "No. MyKad");
    pushIf("ID No", "ID No");
    pushIf("No Pengenalan", "No Pengenalan");
    pushIf("IC", "ic");
    pushIf("Account No", "Account No");
    pushIf("Card No", "Card No");
    pushIf("No. Telefon Rumah", "No. Telefon Rumah");
    pushIf("No. Telefon Bimbit", "No. Telefon Bimbit");
    pushIf("Handphone", "Handphone");
    pushIf("OfficePhone", "OfficePhone");
    pushIf("Alamat Surat Menyurat", "Alamat Surat Menyurat");
    pushIf("HomeAddress1", "HomeAddress1");
    pushIf("HomeAddress2", "HomeAddress2");
    pushIf("HomeAddress3", "HomeAddress3");
    pushIf("HomePostcode", "HomePostcode");
    pushIf("Home Post Code", "Home Post Code");
    pushIf("Home Postal Code", "Home Postal Code");
    pushIf("Bandar", "Bandar");
    pushIf("Negeri", "Negeri");
    pushIf("Poskod", "Poskod");
  }

  if (summary.length === 0 && person && typeof person === "object") {
    const entries = Object.entries(person).filter(([key]) => key !== "id").slice(0, 8);
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        summary.push({ label: key, value: String(value) });
      }
    }
  }

  return summary;
}

export function buildBranchSummary(nearestBranch: AiBranchSummarySource | null): AiSummaryItem[] {
  const summary: AiSummaryItem[] = [];
  if (!nearestBranch) {
    return summary;
  }

  const push = (label: string, value: unknown) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      summary.push({ label, value: String(value) });
    }
  };

  push("Nama Cawangan", nearestBranch.name);
  push("Alamat", nearestBranch.address);
  push("Telefon", nearestBranch.phone);
  push("Fax", nearestBranch.fax);
  push("Business Hour", nearestBranch.businessHour);
  push("Day Open", nearestBranch.dayOpen);
  push("ATM & CDM", nearestBranch.atmCdm);
  push("Inquiry Availability", nearestBranch.inquiryAvailability);
  push("Application Availability", nearestBranch.applicationAvailability);
  push("AEON Lounge", nearestBranch.aeonLounge);
  push("Jarak (KM)", nearestBranch.distanceKm);
  return summary;
}

export function buildExplanation(payload: {
  decision: string | null;
  distanceKm: number | null;
  branch: string | null;
  personSummary: AiSummaryItem[];
  branchSummary: AiSummaryItem[];
  estimatedMinutes: number | null;
  travelMode: string | null;
  missingCoords: boolean;
  suggestions?: string[];
  matchFields?: string[];
  branchTextSearch?: boolean;
}): string {
  const personLines =
    payload.personSummary.length > 0
      ? payload.personSummary.map((item) => `${item.label}: ${item.value}`).join("\n")
      : "Tiada maklumat pelanggan dijumpai.";
  const branchLines =
    payload.branchSummary.length > 0
      ? payload.branchSummary.map((item) => `${item.label}: ${item.value}`).join("\n")
      : payload.missingCoords
        ? "Lokasi pelanggan tidak lengkap (tiada LAT/LNG atau Postcode)."
        : payload.branchTextSearch
          ? "Tiada padanan cawangan ditemui berdasarkan lokasi/teks."
          : "Tiada maklumat cawangan dijumpai.";

  let decisionLine = "Tiada cadangan dibuat.";
  if (payload.decision) {
    const timeInfo = payload.estimatedMinutes ? ` Anggaran masa ${payload.estimatedMinutes} minit.` : "";
    const modeInfo = payload.travelMode ? ` Mod: ${payload.travelMode}.` : "";
    if (payload.distanceKm && payload.branch) {
      decisionLine = `Cadangan: ${payload.decision}. Jarak ke ${payload.branch} adalah ${payload.distanceKm.toFixed(1)}KM.${timeInfo}${modeInfo}`;
    } else {
      decisionLine = `Cadangan: ${payload.decision}.${timeInfo}${modeInfo}`;
    }
  } else if (payload.branchSummary.length > 0) {
    decisionLine = "Cadangan: Sila hubungi/kunjungi cawangan di atas.";
  }

  const base = [
    "Maklumat Pelanggan:",
    personLines,
    "",
    "Cadangan Cawangan Terdekat:",
    branchLines,
    "",
    decisionLine,
  ];

  if (payload.matchFields && payload.matchFields.length > 0) {
    base.push("", "Padanan Medan (Top):", payload.matchFields.join("\n"));
  }

  if (payload.suggestions && payload.suggestions.length > 0) {
    base.push("", "Cadangan Rekod (fuzzy):", payload.suggestions.join("\n"));
  }

  return base.join("\n");
}
