import { resolveCurrentCollectionNicknameFromSession } from "../../routes/collection-access";
import { normalizeCollectionText } from "../../routes/collection.validation";
import {
  aggregateCollectionDailyTimelines,
  computeCollectionDailyTimeline,
} from "./collection-daily-utils";
import {
  createDailySummaryEntry,
  type DailyOverviewBundle,
  type DailyOverviewComputation,
  type DailyResolvedUser,
} from "./collection-daily-overview-shared";
import { buildDailySummaryMapsByUsername } from "./collection-daily-summary-operations";
import { getDailyTargetForOwner } from "./collection-daily-target-operations";
import {
  listAvailableDailyUsers,
  parseRequestedDailyUsernames,
  resolveDailySelectedUsers,
} from "./collection-daily-user-operations";
import type { CollectionStoragePort, ListQuery } from "./collection-service-support";

export type { DailyOverviewComputation, DailyResolvedUser } from "./collection-daily-overview-shared";

export class CollectionDailyOverviewService {
  constructor(private readonly storage: CollectionStoragePort) {}

  async listAvailableDailyUsers(user: { username: string; role: string }): Promise<DailyResolvedUser[]> {
    return listAvailableDailyUsers(this.storage, user);
  }

  async buildDailyOverviewComputation(
    user: { username: string; role: string },
    year: number,
    month: number,
    query: ListQuery,
  ): Promise<DailyOverviewComputation> {
    const [users, currentNickname] = await Promise.all([
      this.listAvailableDailyUsers(user),
      resolveCurrentCollectionNicknameFromSession(this.storage, user),
    ]);
    const selectedUsers = resolveDailySelectedUsers(
      user,
      parseRequestedDailyUsernames(query),
      users,
      currentNickname,
    );

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
    const currentNicknameLower = normalizeCollectionText(currentNickname).toLowerCase();
    const currentUsernameLower = normalizeCollectionText(user.username).toLowerCase();
    const [calendarRows, summariesByUsername] = await Promise.all([
      this.storage.listCollectionDailyCalendar({ year, month }),
      buildDailySummaryMapsByUsername(this.storage, {
        from: monthStart,
        to: monthEnd,
        usernames: selectedUsers.map((item) => item.username),
      }),
    ]);

    const bundles: DailyOverviewBundle[] = await Promise.all(
      selectedUsers.map(async (selectedUser) => {
        const fallbackUsernames =
          currentNicknameLower &&
          currentUsernameLower &&
          selectedUser.username.toLowerCase() === currentNicknameLower &&
          currentNicknameLower !== currentUsernameLower
            ? [currentUsernameLower]
            : [];
        const target = await getDailyTargetForOwner(
          this.storage,
          selectedUser.username,
          year,
          month,
          fallbackUsernames,
        );
        const records =
          summariesByUsername.get(selectedUser.username.toLowerCase()) || createDailySummaryEntry();
        const { amountByDate, customerCountByDate } = records;

        return {
          user: selectedUser,
          timeline: computeCollectionDailyTimeline({
            year,
            month,
            monthlyTarget: Number(target?.monthlyTarget || 0),
            calendarRows,
            amountByDate,
            customerCountByDate,
          }),
        };
      }),
    );
    const aggregate = aggregateCollectionDailyTimelines(
      bundles.map((bundle) => bundle.timeline),
    );

    return {
      selectedUsers,
      summary: aggregate.summary,
      daysInMonth: aggregate.daysInMonth || daysInMonth,
      days: aggregate.days,
    };
  }
}
