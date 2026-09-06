import type {
  BillingPrincipalAging,
  BillingPrincipalReportRow,
  BillingPrincipalTargetInput,
} from "@/lib/api/collection-billing-principal";

export const BILLING_PRINCIPAL_AGINGS: BillingPrincipalAging[] = ["D3", "D4", "D5", "D6"];

type DecimalParts = {
  negative: boolean;
  integer: string;
  fraction: string;
};

function readDecimalParts(value: unknown): DecimalParts | null {
  const normalized = String(value ?? "").trim().replace(/,/g, "");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  return {
    negative: match[1] === "-",
    integer: (match[2] || "0").replace(/^0+(?=\d)/, ""),
    fraction: match[3] || "",
  };
}

function decimalToUnits(value: unknown, scale: number, round = true): bigint | null {
  const parts = readDecimalParts(value);
  if (!parts) return null;
  const keptFraction = parts.fraction.slice(0, scale).padEnd(scale, "0");
  let units = BigInt(`${parts.integer}${keptFraction}`);
  if (round && parts.fraction.length > scale && (parts.fraction[scale] || "0") >= "5") {
    units += 1n;
  }
  return parts.negative ? -units : units;
}

function unitsToDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const divisor = 10n ** BigInt(scale);
  const integer = absolute / divisor;
  const fraction = String(absolute % divisor).padStart(scale, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

function hasAtMostScale(value: unknown, scale: number): boolean {
  const parts = readDecimalParts(value);
  return Boolean(parts && parts.fraction.length <= scale);
}

export function isValidOspMoneyInput(value: unknown, options?: { allowZero?: boolean }): boolean {
  if (!hasAtMostScale(value, 2)) return false;
  const cents = decimalToUnits(value, 2, false);
  return cents !== null && (options?.allowZero ? cents >= 0n : cents > 0n);
}

export function isValidOspPercentageInput(value: unknown): boolean {
  // Match the backend's unsigned decimal grammar before any display-number parsing.
  // Commas and signs must not become valid percentages through normalization.
  return /^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(String(value ?? "").trim());
}

export function subtractOspMoney(left: unknown, right: unknown): string | null {
  const leftCents = decimalToUnits(left, 2);
  const rightCents = decimalToUnits(right, 2);
  if (leftCents === null || rightCents === null) return null;
  return unitsToDecimal(leftCents - rightCents, 2);
}

export function formatOspPercentagePoint(value: unknown): string {
  const units = decimalToUnits(value, 2);
  if (units === null) return "—";
  const formatted = unitsToDecimal(units, 2);
  return `${units > 0n ? "+" : ""}${formatted} pp`;
}

export function isSafeBillingPrincipalLookup(value: string): boolean {
  const compact = value.trim().replace(/[\s-]+/g, "");
  return !/^\d{5,19}$/.test(compact);
}

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
  const cents = decimalToUnits(value, 2);
  // Missing/invalid financial evidence is not a genuine zero baseline.
  if (cents === null) return "—";
  const fixed = unitsToDecimal(cents < 0n ? -cents : cents, 2);
  const [integer = "0", fraction = "00"] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0n ? "-" : ""}RM${grouped}.${fraction}`;
}

export function formatOspPercentage(value: unknown): string {
  const units = decimalToUnits(value, 2);
  return units === null ? "—" : `${unitsToDecimal(units, 2)}%`;
}

export function calculateTargetOspPreview(totalOsp: unknown, targetPercentage: unknown): string {
  const totalCents = decimalToUnits(totalOsp, 2);
  const percentageUnits = decimalToUnits(
    String(targetPercentage ?? "").trim().replace(/%$/, ""),
    4,
  );
  if (totalCents === null || percentageUnits === null || totalCents < 0n || percentageUnits < 0n) {
    return "—";
  }
  const divisor = 1_000_000n;
  const product = totalCents * percentageUnits;
  return unitsToDecimal((product + divisor / 2n) / divisor, 2);
}

export function calculateOspClientPreview(input: ReadonlyArray<{
  aging: BillingPrincipalAging; totalOsp: string; targetPercentage: string; resultPercentage: string;
}>) {
  if (input.some((row) => !isValidOspMoneyInput(row.totalOsp, { allowZero: true })
    || !isValidOspPercentageInput(row.targetPercentage) || !isValidOspPercentageInput(row.resultPercentage))) return null;
  const rows = input.map((row) => {
    const targetOsp = calculateTargetOspPreview(row.totalOsp, row.targetPercentage);
    const ospClosed = calculateTargetOspPreview(row.totalOsp, row.resultPercentage);
    return { ...row, targetOsp, ospClosed, balanceOsp: subtractOspMoney(targetOsp, ospClosed)! };
  });
  const sum = (field: "totalOsp" | "targetOsp" | "ospClosed") => rows.reduce((total, row) => total + decimalToUnits(row[field], 2)!, 0n);
  const total = sum("totalOsp");
  const target = sum("targetOsp");
  const closed = sum("ospClosed");
  const percentage = (amount: bigint) => total === 0n ? "0.0000" : unitsToDecimal((amount * 1_000_000n + total / 2n) / total, 4);
  return { rows, all: { aging: "ALL" as const, totalOsp: unitsToDecimal(total, 2), targetOsp: unitsToDecimal(target, 2),
    ospClosed: unitsToDecimal(closed, 2), balanceOsp: unitsToDecimal(target - closed, 2),
    targetPercentage: percentage(target), resultPercentage: percentage(closed) } };
}

export function filterBillingPrincipalRows(
  rows: readonly BillingPrincipalReportRow[],
  selectedAgings: readonly BillingPrincipalAging[],
) {
  const selected = new Set(selectedAgings);
  return rows.filter((row) => selected.has(row.aging));
}

export function buildBillingPrincipalSavedTargetRows(
  rows: readonly BillingPrincipalReportRow[],
  agingScope: readonly BillingPrincipalAging[],
): BillingPrincipalTargetInput[] {
  return filterBillingPrincipalRows(rows, agingScope).map((row) => ({
    agingBucket: row.aging,
    totalOspBaseline: row.totalOsp,
    targetPercentage: row.targetPercentage,
  }));
}
