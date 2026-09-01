import type {
  BillingPrincipalAging,
  BillingPrincipalReportRow,
} from "@/lib/api/collection-billing-principal";

export const BILLING_PRINCIPAL_AGINGS: BillingPrincipalAging[] = ["D3", "D4", "D5", "D6"];

export function getCurrentMonthDateRange(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

export function formatOspCurrency(value: unknown): string {
  const amount = Number(String(value ?? "0"));
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-MY", {
        style: "currency",
        currency: "MYR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "RM0.00";
}

export function formatOspPercentage(value: unknown): string {
  const percentage = Number(String(value ?? "0"));
  return `${Number.isFinite(percentage) ? percentage.toFixed(2) : "0.00"}%`;
}

export function calculateTargetOspPreview(totalOsp: unknown, targetPercentage: unknown): string {
  const total = Number(String(totalOsp ?? "0").replace(/,/g, ""));
  const percentage = Number(String(targetPercentage ?? "0").replace(/%/g, ""));
  if (!Number.isFinite(total) || !Number.isFinite(percentage) || total < 0 || percentage < 0) {
    return "0.00";
  }
  return (total * percentage / 100).toFixed(2);
}

export function filterBillingPrincipalRows(
  rows: BillingPrincipalReportRow[],
  selectedAgings: BillingPrincipalAging[],
) {
  const selected = new Set(selectedAgings);
  return rows.filter((row) => selected.has(row.aging));
}
