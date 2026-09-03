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
  if (!hasAtMostScale(value, 4)) return false;
  const units = decimalToUnits(value, 4, false);
  return units !== null && units >= 0n && units <= 1_000_000n;
}

export function subtractOspMoney(left: unknown, right: unknown): string | null {
  const leftCents = decimalToUnits(left, 2);
  const rightCents = decimalToUnits(right, 2);
  if (leftCents === null || rightCents === null) return null;
  return unitsToDecimal(leftCents - rightCents, 2);
}

export function getClientResultConsistencyWarning(input: {
  totalOsp: unknown;
  clientOspClosed: unknown;
  clientResultPercentage: unknown;
}): string | null {
  const totalCents = decimalToUnits(input.totalOsp, 2, false);
  const clientCents = decimalToUnits(input.clientOspClosed, 2, false);
  const submittedPercentageUnits = decimalToUnits(input.clientResultPercentage, 4, false);
  if (totalCents === null || clientCents === null || submittedPercentageUnits === null) return null;

  if (totalCents <= 0n) {
    return clientCents === 0n && submittedPercentageUnits === 0n
      ? null
      : "Client RESULT % cannot be reconciled because the saved TT OSP is zero.";
  }

  const percentageScale = 1_000_000n;
  const numerator = clientCents * percentageScale;
  const expectedPercentageUnits = numerator >= 0n
    ? (numerator + totalCents / 2n) / totalCents
    : (numerator - totalCents / 2n) / totalCents;
  if (expectedPercentageUnits === submittedPercentageUnits) return null;

  return `Client RESULT % does not equal Client OSP CLOSED / saved TT OSP (expected ${unitsToDecimal(expectedPercentageUnits, 4)}%).`;
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
  if (cents === null) return "RM0.00";
  const fixed = unitsToDecimal(cents < 0n ? -cents : cents, 2);
  const [integer = "0", fraction = "00"] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0n ? "-" : ""}RM${grouped}.${fraction}`;
}

export function formatOspPercentage(value: unknown): string {
  const units = decimalToUnits(value, 2);
  return `${units === null ? "0.00" : unitsToDecimal(units, 2)}%`;
}

export function calculateTargetOspPreview(totalOsp: unknown, targetPercentage: unknown): string {
  const totalCents = decimalToUnits(totalOsp, 2);
  const percentageUnits = decimalToUnits(
    String(targetPercentage ?? "").trim().replace(/%$/, ""),
    4,
  );
  if (totalCents === null || percentageUnits === null || totalCents < 0n || percentageUnits < 0n) {
    return "0.00";
  }
  const divisor = 1_000_000n;
  const product = totalCents * percentageUnits;
  return unitsToDecimal((product + divisor / 2n) / divisor, 2);
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
