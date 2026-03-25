import { badRequest, forbidden } from "../../http/errors";
import {
  getAdminVisibleNicknameValues,
  resolveCurrentCollectionNicknameFromSession,
} from "../../routes/collection-access";
import {
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  aggregateCollectionDailyTimelines,
  computeCollectionDailyTimeline,
} from "./collection-daily-utils";
import type { CollectionStoragePort, ListQuery } from "./collection-service-support";

type DailyOverviewTimelineSummary = ReturnType<typeof aggregateCollectionDailyTimelines>["summary"];
const DAILY_OVERVIEW_FALLBACK_PAGE_SIZE = 1000;

export type DailyResolvedUser = {
  id: string;
  username: string;
  role: string;
};

type DailyOverviewBundle = {
  user: DailyResolvedUser;
  timeline: ReturnType<typeof computeCollectionDailyTimeline>;
};

export type DailyOverviewComputation = {
  selectedUsers: DailyResolvedUser[];
  summary: DailyOverviewTimelineSummary;
  daysInMonth: number;
  days: Array<{
    day: number;
    date: string;
    amount: number;
    target: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName: string | null;
    customerCount: number;
    status: "green" | "yellow" | "red" | "neutral";
  }>;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class CollectionDailyOverviewService {
  constructor(private readonly storage: CollectionStoragePort) {}

  private createDailySummaryEntry(): {
    amountByDate: Map<string, number>;
    customerCountByDate: Map<string, number>;
  } {
    return {
      amountByDate: new Map<string, number>(),
      customerCountByDate: new Map<string, number>(),
    };
  }

  private async loadDailySummaryFallbackRecords(params: {
    from: string;
    to: string;
    nickname: string;
  }) {
    const records: Awaited<ReturnType<CollectionStoragePort["listCollectionRecords"]>> = [];
    let offset = 0;

    for (;;) {
      const batch = await this.storage.listCollectionRecords({
        from: params.from,
        to: params.to,
        nicknames: [params.nickname],
        limit: DAILY_OVERVIEW_FALLBACK_PAGE_SIZE,
        offset,
      });

      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }

      records.push(...batch);

      if (batch.length < DAILY_OVERVIEW_FALLBACK_PAGE_SIZE) {
        break;
      }

      offset += batch.length;
    }

    return records;
  }

  private async buildDailySummaryMaps(params: {
    from: string;
    to: string;
    username: string;
  }): Promise<{
    amountByDate: Map<string, number>;
    customerCountByDate: Map<string, number>;
  }> {
    const nickname = String(params.username || "").trim();
    const summaryRows =
      typeof this.storage.summarizeCollectionRecordsByNicknameAndPaymentDate === "function"
        ? await this.storage.summarizeCollectionRecordsByNicknameAndPaymentDate({
            from: params.from,
            to: params.to,
            nicknames: [nickname],
          })
        : null;

    const amountByDate = new Map<string, number>();
    const customerCountByDate = new Map<string, number>();

    if (Array.isArray(summaryRows)) {
      for (const row of summaryRows) {
        const key = String(row.paymentDate || "");
        if (!key) continue;
        amountByDate.set(key, roundMoney(Number(row.totalAmount || 0)));
        customerCountByDate.set(key, Number(row.totalRecords || 0));
      }
      return {
        amountByDate,
        customerCountByDate,
      };
    }

    const records = await this.loadDailySummaryFallbackRecords({
      from: params.from,
      to: params.to,
      nickname,
    });

    for (const record of records) {
      const key = record.paymentDate;
      const amount = Number(record.amount || 0);
      amountByDate.set(key, roundMoney((amountByDate.get(key) || 0) + (Number.isFinite(amount) ? amount : 0)));
      customerCountByDate.set(key, (customerCountByDate.get(key) || 0) + 1);
    }

    return {
      amountByDate,
      customerCountByDate,
    };
  }

  private async buildDailySummaryMapsByUsername(params: {
    from: string;
    to: string;
    usernames: string[];
  }): Promise<
    Map<
      string,
      {
        amountByDate: Map<string, number>;
        customerCountByDate: Map<string, number>;
      }
    >
  > {
    const normalizedUsernames = Array.from(
      new Set(
        params.usernames
          .map((value) => normalizeCollectionText(value))
          .filter(Boolean),
      ),
    );
    const summaryByUsername = new Map<
      string,
      {
        amountByDate: Map<string, number>;
        customerCountByDate: Map<string, number>;
      }
    >(
      normalizedUsernames.map((username) => [
        username.toLowerCase(),
        this.createDailySummaryEntry(),
      ]),
    );

    if (
      normalizedUsernames.length > 0
      && typeof this.storage.summarizeCollectionRecordsByNicknameAndPaymentDate === "function"
    ) {
      const summaryRows = await this.storage.summarizeCollectionRecordsByNicknameAndPaymentDate({
        from: params.from,
        to: params.to,
        nicknames: normalizedUsernames,
      });

      for (const row of summaryRows) {
        const nicknameKey = normalizeCollectionText(row.nickname).toLowerCase();
        if (!nicknameKey || !summaryByUsername.has(nicknameKey)) continue;
        const dateKey = String(row.paymentDate || "");
        if (!dateKey) continue;
        const summaryEntry = summaryByUsername.get(nicknameKey)!;
        summaryEntry.amountByDate.set(dateKey, roundMoney(Number(row.totalAmount || 0)));
        summaryEntry.customerCountByDate.set(dateKey, Number(row.totalRecords || 0));
      }

      return summaryByUsername;
    }

    const fallbackEntries = await Promise.all(
      normalizedUsernames.map(async (username) => [
        username.toLowerCase(),
        await this.buildDailySummaryMaps({
          from: params.from,
          to: params.to,
          username,
        }),
      ] as const),
    );

    return new Map(fallbackEntries);
  }

  private parseRequestedDailyUsernames(query: ListQuery): string[] {
    const rawValues: unknown[] = [];
    const appendValues = (raw: unknown) => {
      if (Array.isArray(raw)) {
        for (const value of raw) appendValues(value);
        return;
      }
      const normalized = normalizeCollectionText(raw);
      if (!normalized) return;
      const parts = normalized
        .split(",")
        .map((value) => normalizeCollectionText(value))
        .filter(Boolean);
      rawValues.push(...parts);
    };

    appendValues(query.usernames);
    appendValues(query.username);
    appendValues(query.nicknames);
    appendValues(query.nickname);
    appendValues(query.staff);
    const normalized = normalizeCollectionStringList(rawValues)
      .map((value) => value.toLowerCase());
    return Array.from(new Set(normalized));
  }

  async listAvailableDailyUsers(user: { username: string; role: string }): Promise<DailyResolvedUser[]> {
    const normalizeDailyUser = (
      id: string | null | undefined,
      username: string | null | undefined,
      role: string | null | undefined,
    ): DailyResolvedUser | null => {
      const normalizedUsername = normalizeCollectionText(username);
      if (!normalizedUsername) return null;
      return {
        id: normalizeCollectionText(id) || normalizedUsername.toLowerCase(),
        username: normalizedUsername,
        role: normalizeCollectionText(role) || "user",
      };
    };

    if (user.role === "user") {
      const currentNickname = await resolveCurrentCollectionNicknameFromSession(this.storage, user as any);
      if (!currentNickname) {
        return [];
      }
      const nicknameProfile = await this.storage.getCollectionStaffNicknameByName(currentNickname);
      const resolved = normalizeDailyUser(
        nicknameProfile?.id,
        nicknameProfile?.nickname || currentNickname,
        nicknameProfile?.roleScope || user.role,
      );
      return resolved ? [resolved] : [];
    }

    if (user.role === "admin") {
      const visibleNicknames = await getAdminVisibleNicknameValues(this.storage, user as any);
      if (visibleNicknames.length === 0) {
        return [];
      }
      const nicknameProfiles = await this.storage.getCollectionStaffNicknames();
      const profileByLower = new Map(
        nicknameProfiles.map((item) => [item.nickname.toLowerCase(), item]),
      );
      return visibleNicknames
        .map((nickname) => {
          const matched = profileByLower.get(nickname.toLowerCase());
          return normalizeDailyUser(
            matched?.id,
            matched?.nickname || nickname,
            matched?.roleScope || "user",
          );
        })
        .filter((item): item is DailyResolvedUser => Boolean(item));
    }

    const nicknameProfiles = await this.storage.getCollectionStaffNicknames();
    return nicknameProfiles
      .map((item) => normalizeDailyUser(item.id, item.nickname, item.roleScope))
      .filter((item): item is DailyResolvedUser => Boolean(item));
  }

  private resolveDailySelectedUsers(
    user: { username: string; role: string },
    requestedUsernames: string[],
    availableUsers: DailyResolvedUser[],
    preferredUsername?: string | null,
  ): DailyResolvedUser[] {
    const userMap = new Map<string, DailyResolvedUser>(
      availableUsers.map((item) => [
        item.username.toLowerCase(),
        item,
      ]),
    );
    if (user.role === "user") {
      const ownUsername = normalizeCollectionText(preferredUsername).toLowerCase();
      if (!ownUsername) {
        throw badRequest("Current staff nickname session could not be resolved.");
      }
      if (requestedUsernames.length > 0 && requestedUsernames.some((value) => value !== ownUsername)) {
        throw forbidden("User hanya boleh melihat data sendiri.");
      }
      const ownUser = userMap.get(ownUsername);
      if (!ownUser) {
        throw badRequest("Staff nickname not found.");
      }
      return [ownUser];
    }

    const preferredUsernameLower = normalizeCollectionText(preferredUsername).toLowerCase();
    const targetUsernames = requestedUsernames.length > 0
      ? requestedUsernames
      : (preferredUsernameLower && userMap.has(preferredUsernameLower)
          ? [preferredUsernameLower]
          : availableUsers.length > 0
            ? [availableUsers[0].username.toLowerCase()]
            : []);

    const selectedUsers: DailyResolvedUser[] = [];
    for (const username of targetUsernames) {
      const matched = userMap.get(username.toLowerCase());
      if (!matched) {
        throw badRequest(`Invalid staff nickname filter: ${username}`);
      }
      selectedUsers.push(matched);
    }

    if (selectedUsers.length === 0) {
      throw badRequest("No staff nicknames selected.");
    }

    return selectedUsers;
  }

  private async getDailyTargetForOwner(
    username: string,
    year: number,
    month: number,
    fallbackUsernames: string[] = [],
  ) {
    const normalizedFallbacks = Array.from(
      new Set(
        fallbackUsernames
          .map((value) => normalizeCollectionText(value).toLowerCase())
          .filter((value) => value && value !== username.toLowerCase()),
      ),
    );

    const directTarget = await this.storage.getCollectionDailyTarget({ username, year, month });
    if (directTarget) {
      return directTarget;
    }

    for (const fallbackUsername of normalizedFallbacks) {
      const fallbackTarget = await this.storage.getCollectionDailyTarget({
        username: fallbackUsername,
        year,
        month,
      });
      if (fallbackTarget) {
        return fallbackTarget;
      }
    }

    return undefined;
  }

  async buildDailyOverviewComputation(
    user: { username: string; role: string },
    year: number,
    month: number,
    query: ListQuery,
  ): Promise<DailyOverviewComputation> {
    const [users, currentNickname] = await Promise.all([
      this.listAvailableDailyUsers(user),
      resolveCurrentCollectionNicknameFromSession(this.storage, user as any),
    ]);
    const selectedUsers = this.resolveDailySelectedUsers(
      user,
      this.parseRequestedDailyUsernames(query),
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
      this.buildDailySummaryMapsByUsername({
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
        const target = await this.getDailyTargetForOwner(
          selectedUser.username,
          year,
          month,
          fallbackUsernames,
        );
        const records =
          summariesByUsername.get(selectedUser.username.toLowerCase()) || this.createDailySummaryEntry();
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
