import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import type { CollectionDashboardSummaryContract } from "../../../shared/api-contracts";
import type { CollectionStoragePort } from "./collection-service-support";
import { loadActiveCollectionTeams, type ActiveCollectionTeam } from "./collection-team-scope";

type NicknameTotal = { nickname: string; totalAmount: number; totalRecords: number };

/** Uses the same explicitly assigned, active members as the Collection Team Leader filter. */
export function buildDashboardLeaderTotals(
  teams: readonly ActiveCollectionTeam[],
  totals: readonly NicknameTotal[],
) {
  const byNickname = new Map<string, { amount: number; records: number }>();
  for (const total of totals) {
    const key = total.nickname.trim().toLowerCase();
    const existing = byNickname.get(key) ?? { amount: 0, records: 0 };
    existing.amount += Math.round(Number(total.totalAmount) * 100);
    existing.records += total.totalRecords;
    byNickname.set(key, existing);
  }
  const assigned = new Set<string>();
  const leaders = teams.map((team) => {
    let amount = 0;
    let totalRecords = 0;
    for (const nickname of team.nicknames) {
      const key = nickname.trim().toLowerCase();
      assigned.add(key);
      const total = byNickname.get(key);
      amount += total?.amount ?? 0;
      totalRecords += total?.records ?? 0;
    }
    return {
      id: team.id,
      name: team.leaderNickname,
      totalAmount: parseCollectionAmountMyrNumber(amount / 100),
      totalRecords,
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount || a.name.localeCompare(b.name));
  let unassignedCents = 0;
  for (const [key, total] of byNickname) {
    if (!assigned.has(key)) unassignedCents += total.amount;
  }
  return { leaders, unassignedAmount: parseCollectionAmountMyrNumber(unassignedCents / 100) };
}

export async function getCollectionDashboardSummary(
  storage: CollectionStoragePort,
  options: { year: number; month: number; canViewLeaderBreakdown: boolean; scopeLabel: string },
): Promise<CollectionDashboardSummaryContract> {
  const base = {
    month: options.month,
    scopeLabel: options.scopeLabel,
    canViewLeaderBreakdown: options.canViewLeaderBreakdown,
  };
  // Do not read the team directory or cross-team aggregates for a restricted viewer.
  if (!options.canViewLeaderBreakdown) return { ...base, leaders: [], unassignedAmount: 0 };

  const monthKey = `${options.year}-${String(options.month).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(options.year, options.month, 0)).getUTCDate();
  const [teams, totals] = await Promise.all([
    loadActiveCollectionTeams(storage),
    storage.summarizeCollectionRecordsByNickname({
      from: `${monthKey}-01`,
      to: `${monthKey}-${lastDay}`,
    }),
  ]);
  return { ...base, ...buildDashboardLeaderTotals(teams, totals) };
}
