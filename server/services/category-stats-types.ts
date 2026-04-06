import type { PostgresStorage } from "../storage-postgres";

export type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

export type CategoryStatsRow = Awaited<ReturnType<PostgresStorage["getCategoryStats"]>>[number];

export type CountQuerySummary = {
  processing: boolean;
  summary: string;
  stats: CategoryStatsRow[];
};

export const CATEGORY_RULES_CACHE_MS = 60_000;

export const DEFAULT_COUNT_GROUPS: CategoryRule[] = [
  {
    key: "kerajaan",
    terms: [
      "kerajaan", "government", "gov", "gomen", "sector awam", "public sector",
      "kementerian", "jabatan", "agensi", "persekutuan", "negeri", "majlis",
      "kkm", "kpm", "kpt", "moe", "moh", "state government", "federal",
      "sekolah", "guru", "teacher", "cikgu", "pendidikan", "government",
    ],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "polis",
    terms: ["polis", "police", "pdrm", "polis diraja malaysia", "ipd", "ipk"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "tentera",
    terms: ["tentera", "army", "military", "atm", "angkatan tentera", "tldm", "tudm", "tentera darat", "tentera laut", "tentera udara"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "hospital",
    terms: ["hospital", "klinik", "clinic", "medical", "kesihatan", "health", "klin ik", "medical center", "healthcare"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "hotel",
    terms: ["hotel", "hospitality", "resort", "inn", "motel", "restaurant"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "swasta",
    terms: ["swasta", "private", "sdn bhd", "bhd", "enterprise", "trading", "ltd", "plc"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "complement",
  },
];
