import { sql } from "drizzle-orm";

export type AiRuleSeed = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

const defaultFields = [
  "NOB",
  "NATURE OF BUSINESS",
  "Nature of Business",
  "EMPLOYER NAME",
  "EmployerName",
  "Company",
  "Nama Majikan",
  "Majikan",
  "Department",
  "Agensi",
];

export const defaultAiCategoryRules: AiRuleSeed[] = [
  {
    key: "kerajaan",
    terms: [
      "GOVERNMENT",
      "KERAJAAN",
      "PUBLIC SECTOR",
      "SECTOR AWAM",
      "KEMENTERIAN",
      "JABATAN",
      "AGENSI",
      "PERSEKUTUAN",
      "NEGERI",
      "MAJLIS",
      "KKM",
      "KPM",
      "KPT",
      "MOE",
      "MOH",
      "SEKOLAH",
      "GURU",
      "TEACHER",
      "CIKGU",
      "PENDIDIKAN",
    ],
    fields: defaultFields,
    matchMode: "contains",
    enabled: true,
  },
  {
    key: "hospital",
    terms: [
      "HEALTHCARE",
      "HOSPITAL",
      "CLINIC",
      "KLINIK",
      "KESIHATAN",
      "MEDICAL",
      "HEALTH",
    ],
    fields: defaultFields,
    matchMode: "contains",
    enabled: true,
  },
  {
    key: "hotel",
    terms: [
      "HOTEL",
      "HOSPITALITY",
      "RESORT",
      "INN",
      "MOTEL",
      "RESTAURANT",
      "SERVICE LINE",
      "HOTEL,RESTAURANT",
      "HOTEL & RESTAURANT",
    ],
    fields: defaultFields,
    matchMode: "contains",
    enabled: true,
  },
  {
    key: "polis",
    terms: ["POLIS", "POLICE", "PDRM", "IPD", "IPK", "ROYAL MALAYSIA POLICE"],
    fields: defaultFields,
    matchMode: "contains",
    enabled: true,
  },
  {
    key: "tentera",
    terms: [
      "TENTERA",
      "ARMY",
      "MILITARY",
      "ARMED FORCES",
      "ATM",
      "TUDM",
      "TLDM",
      "TENTERA DARAT",
      "TENTERA LAUT",
      "TENTERA UDARA",
      "ANGKATAN TENTERA",
      "ANGKATAN TENTERA MALAYSIA",
      "MINDEF",
      "MINISTRY OF DEFENCE",
      "KEMENTERIAN PERTAHANAN",
      "DEFENCE",
      "PERTAHANAN",
    ],
    fields: defaultFields,
    matchMode: "contains",
    enabled: true,
  },
  {
    key: "swasta",
    terms: ["SWASTA", "PRIVATE", "SDN BHD", "BHD", "ENTERPRISE", "TRADING", "LTD", "PLC"],
    fields: defaultFields,
    matchMode: "complement",
    enabled: true,
  },
];

export function toTextArray(values: string[]) {
  if (!values.length) return sql`'{}'::text[]`;
  const joined = sql.join(values.map((value) => sql`${value}`), sql`, `);
  return sql`ARRAY[${joined}]::text[]`;
}
