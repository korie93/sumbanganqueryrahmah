import type { CollectionAgingBucket, CollectionOspDailyMovementView } from "../storage-postgres-collection-types";
import { formatCollectionOspMoneyCents, formatCollectionOspPercentage, parseCollectionOspMoneyCents } from "./collection-osp-reconciliation";

const AGINGS: readonly CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];

/** Only consume the canonical effective-account SQL aggregates, never raw payments. */
export function buildCollectionOspDailyMovements(input: {
  dates: readonly string[];
  targets: readonly { aging: CollectionAgingBucket; targetOsp: string }[];
  movements: readonly { date: string; aging: CollectionAgingBucket; ospClosed: string; accountCount: number }[];
}): Map<string, CollectionOspDailyMovementView> {
  const targets = new Map(input.targets.map((row) => [row.aging, parseCollectionOspMoneyCents(row.targetOsp)]));
  if (targets.size !== 4 || AGINGS.some((aging) => !targets.has(aging))) {
    throw new Error("Daily OSP movement requires the complete shared D3–D6 target configuration.");
  }
  const byDate = new Map<string, Map<CollectionAgingBucket, { closed: bigint; accounts: number }>>();
  for (const movement of input.movements) {
    const values = byDate.get(movement.date) ?? new Map();
    const previous = values.get(movement.aging) ?? { closed: 0n, accounts: 0 };
    values.set(movement.aging, {
      closed: previous.closed + parseCollectionOspMoneyCents(movement.ospClosed),
      accounts: previous.accounts + movement.accountCount,
    });
    byDate.set(movement.date, values);
  }
  return new Map(input.dates.map((date) => {
    let totalTarget = 0n;
    let totalClosed = 0n;
    let totalAccounts = 0;
    const rows = AGINGS.map((aging) => {
      const target = targets.get(aging)!;
      const { closed, accounts } = byDate.get(date)?.get(aging) ?? { closed: 0n, accounts: 0 };
      totalTarget += target;
      totalClosed += closed;
      totalAccounts += accounts;
      return { aging, targetOsp: formatCollectionOspMoneyCents(target),
        ospClosed: formatCollectionOspMoneyCents(closed), resultPercentage: formatCollectionOspPercentage(closed, target),
        closedAccountCount: accounts };
    });
    return [date, { rows, all: { aging: "ALL", targetOsp: formatCollectionOspMoneyCents(totalTarget),
      ospClosed: formatCollectionOspMoneyCents(totalClosed), resultPercentage: formatCollectionOspPercentage(totalClosed, totalTarget),
      closedAccountCount: totalAccounts } }];
  }));
}
