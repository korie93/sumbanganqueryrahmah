import type {
  CollectionAgingBucket,
  CollectionBillingPrincipalReport,
  CollectionOspTargetInput,
} from "../storage-postgres-collection-types";

const AGINGS: CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];

function parseFixed(value: unknown, scale: number): bigint {
  const normalized = String(value ?? "0").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return 0n;
  const fraction = String(match[2] || "").slice(0, scale).padEnd(scale, "0");
  return BigInt(match[1]) * (10n ** BigInt(scale)) + BigInt(fraction || "0");
}
function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n;
  return (numerator + (denominator / 2n)) / denominator;
}

function formatFixed(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(scale, "0");
  return scale > 0 ? `${whole}.${fraction}` : whole.toString();
}

function calculateTargetCents(totalCents: bigint, targetPercentageUnits: bigint): bigint {
  // target percentage is stored with four decimals; divide by 100 percent.
  return roundDivide(totalCents * targetPercentageUnits, 1_000_000n);
}

function calculateResultPercentageUnits(closedCents: bigint, totalCents: bigint): bigint {
  // Two decimal percentage units: RM50/RM100 -> 50.00 -> 5000 units.
  return totalCents <= 0n ? 0n : roundDivide(closedCents * 10_000n, totalCents);
}

export function buildCollectionBillingPrincipalReport(input: {
  rawTotalOspByAging: Partial<Record<CollectionAgingBucket, string>>;
  ospClosedByAging: Partial<Record<CollectionAgingBucket, string>>;
  closedAccountCountByAging?: Partial<Record<CollectionAgingBucket, number>>;
  targets?: CollectionOspTargetInput[];
}): CollectionBillingPrincipalReport {
  const targetByAging = new Map(
    (input.targets || []).map((target) => [target.agingBucket, target] as const),
  );

  const rows = AGINGS.map((aging) => {
    const target = targetByAging.get(aging);
    const rawTotalCents = parseFixed(input.rawTotalOspByAging[aging] || "0", 2);
    const totalCents = target?.totalOspBaseline == null
      ? rawTotalCents
      : parseFixed(target.totalOspBaseline, 2);
    const closedCents = parseFixed(input.ospClosedByAging[aging] || "0", 2);
    const targetPercentageUnits = parseFixed(target?.targetPercentage || "0", 4);
    const targetCents = calculateTargetCents(totalCents, targetPercentageUnits);
    const resultPercentageUnits = calculateResultPercentageUnits(closedCents, totalCents);

    return {
      aging,
      totalOsp: formatFixed(totalCents, 2),
      targetPercentage: formatFixed(targetPercentageUnits, 4),
      targetOsp: formatFixed(targetCents, 2),
      resultPercentage: formatFixed(resultPercentageUnits, 2),
      ospClosed: formatFixed(closedCents, 2),
      closedAccountCount: Math.max(0, Math.trunc(input.closedAccountCountByAging?.[aging] || 0)),
    };
  });

  const totals = rows.reduce((aggregate, row) => ({
    totalCents: aggregate.totalCents + parseFixed(row.totalOsp, 2),
    targetCents: aggregate.targetCents + parseFixed(row.targetOsp, 2),
    closedCents: aggregate.closedCents + parseFixed(row.ospClosed, 2),
    closedAccountCount: aggregate.closedAccountCount + row.closedAccountCount,
  }), { totalCents: 0n, targetCents: 0n, closedCents: 0n, closedAccountCount: 0 });

  const weightedTargetPercentageUnits = totals.totalCents <= 0n
    ? 0n
    : roundDivide(totals.targetCents * 10_000n, totals.totalCents);
  const weightedResultPercentageUnits = calculateResultPercentageUnits(
    totals.closedCents,
    totals.totalCents,
  );

  return {
    rows,
    all: {
      aging: "ALL",
      totalOsp: formatFixed(totals.totalCents, 2),
      targetPercentage: formatFixed(weightedTargetPercentageUnits, 2),
      targetOsp: formatFixed(totals.targetCents, 2),
      resultPercentage: formatFixed(weightedResultPercentageUnits, 2),
      ospClosed: formatFixed(totals.closedCents, 2),
      closedAccountCount: totals.closedAccountCount,
    },
  };
}
