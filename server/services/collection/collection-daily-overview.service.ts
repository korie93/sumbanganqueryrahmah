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
    const calendarRows = await this.storage.listCollectionDailyCalendar({ year, month });
    const currentNicknameLower = normalizeCollectionText(currentNickname).toLowerCase();
    const currentUsernameLower = normalizeCollectionText(user.username).toLowerCase();

    const bundles: DailyOverviewBundle[] = await Promise.all(
      selectedUsers.map(async (selectedUser) => {
        const fallbackUsernames =
          currentNicknameLower &&
          currentUsernameLower &&
          selectedUser.username.toLowerCase() === currentNicknameLower &&
          currentNicknameLower !== currentUsernameLower
            ? [currentUsernameLower]
            : [];
        const [target, records] = await Promise.all([
          this.getDailyTargetForOwner(selectedUser.username, year, month, fallbackUsernames),
          this.storage.listCollectionRecords({
            from: monthStart,
            to: monthEnd,
            nicknames: [selectedUser.username],
            limit: 5000,
            offset: 0,
          }),
        ]);

        const amountByDate = new Map<string, number>();
        const customerCountByDate = new Map<string, number>();
        for (const record of records) {
          const key = record.paymentDate;
          const amount = Number(record.amount || 0);
          amountByDate.set(key, roundMoney((amountByDate.get(key) || 0) + (Number.isFinite(amount) ? amount : 0)));
          customerCountByDate.set(key, (customerCountByDate.get(key) || 0) + 1);
        }

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
