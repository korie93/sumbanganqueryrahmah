import type { CollectionMonthlySummary } from "@/lib/api";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function buildEmptySummary(): CollectionMonthlySummary[] {
  return MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    totalRecords: 0,
    totalAmount: 0,
  }));
}

export function normalizeSummaryRows(
  rows: CollectionMonthlySummary[] | undefined,
): CollectionMonthlySummary[] {
  if (!Array.isArray(rows) || rows.length === 0) return buildEmptySummary();

  const byMonth = new Map<number, CollectionMonthlySummary>();
  for (const row of rows) {
    const month = Number(row?.month || 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      month,
      monthName: String(row.monthName || MONTH_NAMES[month - 1]),
      totalRecords: Number(row.totalRecords || 0),
      totalAmount: Number(row.totalAmount || 0),
    });
  }

  return MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const found = byMonth.get(month);
    if (found) return found;
    return {
      month,
      monthName,
      totalRecords: 0,
      totalAmount: 0,
    };
  });
}

export function normalizeNicknameSelection(values: string[]): string[] {
  const unique = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    result.push(normalized);
  }
  return result;
}

export function toDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function buildMonthRange(year: number, month: number): { from: string; to: string } {
  const safeMonth = Math.min(12, Math.max(1, month));
  const monthText = String(safeMonth).padStart(2, "0");
  const from = `${year}-${monthText}-01`;
  const lastDay = new Date(year, safeMonth, 0).getDate();
  const to = `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
