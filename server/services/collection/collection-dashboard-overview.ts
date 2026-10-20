import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest, forbidden } from "../../http/errors";
import { canViewAllStaff } from "../../../shared/user-roles";
import { getCollectionDashboardSummary } from "./collection-dashboard-summary";
import { getCollectionReportFreshness } from "./collection-report-freshness";
import type { CollectionStoragePort } from "./collection-service-support";

/** Dashboard scope is account-bound, never chosen by a query or nickname session. */
export async function getCollectionDashboardOverview(
  storage: CollectionStoragePort,
  user: AuthenticatedUser,
  year: number,
  month: number,
  requestedNicknames: string[],
) {
  if (requestedNicknames.length) throw badRequest("Dashboard scope cannot be selected by nickname.");
  const all = canViewAllStaff(user.role);
  const label = all ? "All Collection records" : user.role === "admin" ? "Your Collection team" : "Your Collection nickname";
  const options = { year, month, canViewLeaderBreakdown: all, scopeLabel: label };
  let nicknames: string[] | undefined;
  if (!all) {
    const link = user.userId ? await storage.getCollectionDashboardAccount(user.userId) : null;
    if (!link?.isActive || !link.nickname?.trim() || link.accountRole !== user.role) {
      return { ok: true as const, year, summary: [], dashboard: {
        month, scopeLabel: label, canViewLeaderBreakdown: false, leaders: [], unassignedAmount: 0,
        scopeStatus: "link_required" as const,
      } };
    }
    nicknames = user.role === "admin"
      ? await storage.getCollectionAdminGroupVisibleNicknameValuesByLeader(link.nickname)
      : [link.nickname];
    nicknames = nicknames.map((nickname) => nickname.trim()).filter(Boolean);
    // Repository aggregate builders intentionally treat [] as "no filter".
    // Never send an empty restricted scope through that legacy convention.
    if (!nicknames.length) throw forbidden("Collection Dashboard scope is unavailable.");
  }
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const scope = nicknames === undefined ? {} : { nicknames };
  const [summary, freshness, dashboard] = await Promise.all([
    storage.getCollectionMonthlySummary({ year, ...scope }),
    getCollectionReportFreshness(storage, {
      from: `${monthKey}-01`,
      to: `${monthKey}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
      ...scope,
    }),
    getCollectionDashboardSummary(storage, options),
  ]);
  return {
    ok: true as const, year,
    summary: summary.filter((row) => row.month === month),
    freshness, dashboard: { ...dashboard, scopeStatus: "ready" as const },
  };
}
