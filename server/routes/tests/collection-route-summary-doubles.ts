import type { PostgresStorage } from "../../storage-postgres";

export function createCollectionSummaryStorageDouble(options?: {
  sessionNickname?: string | null;
}) {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameActiveChecks: string[] = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const activeNicknames = [
    {
      id: "nickname-1",
      nickname: "Collector Alpha",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "nickname-2",
      nickname: "Collector Beta",
      isActive: true,
      roleScope: "both",
      createdBy: "superuser",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ];
  const nicknameSet = new Set(activeNicknames.map((item) => item.nickname.toLowerCase()));

  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      if (!options?.sessionNickname) {
        return null;
      }
      return {
        activityId,
        username: "staff.user",
        userRole: "user",
        nickname: options.sessionNickname,
        verifiedAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      };
    },
    getCollectionStaffNicknames: async (_filters?: Record<string, unknown>) => activeNicknames,
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [
        { month: 1, monthName: "January", totalRecords: 2, totalAmount: 300 },
        { month: 2, monthName: "February", totalRecords: 1, totalAmount: 150.5 },
      ];
    },
    isCollectionStaffNicknameActive: async (nickname: string) => {
      nicknameActiveChecks.push(nickname);
      return nicknameSet.has(String(nickname).toLowerCase());
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 3,
        totalAmount: 450.5,
      };
    },
    summarizeCollectionRecordsByNickname: async (_filters: Record<string, unknown>) => {
      return [
        {
          nickname: "Collector Alpha",
          totalRecords: 3,
          totalAmount: 450.5,
        },
      ];
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-summary-1",
          customerName: "Alice Tan",
          icNumber: "900101015555",
          customerPhone: "0123456789",
          accountNumber: "ACC-1001",
          batch: "P10",
          paymentDate: "2026-03-01",
          amount: "120.50",
          receiptFile: null,
          receipts: [],
          createdByLogin: "staff.user",
          collectionStaffNickname: "Collector Alpha",
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    monthlySummaryCalls,
    nicknameActiveChecks,
    nicknameSummaryCalls,
    nicknameListCalls,
  };
}

export function createAdminCollectionSummaryStorageDouble() {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const sessionActivityCalls: string[] = [];
  const groupLeaderCalls: string[] = [];
  const staffNicknameLookups: string[] = [];
  const allowedNicknames = ["Collector Alpha", "Collector Beta"];

  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      sessionActivityCalls.push(activityId);
      return {
        activityId,
        username: "admin.user",
        userRole: "admin",
        nickname: "Collector Alpha",
        verifiedAt: new Date("2026-03-10T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T00:00:00.000Z"),
      };
    },
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async (leaderNickname: string) => {
      groupLeaderCalls.push(leaderNickname);
      return allowedNicknames;
    },
    getCollectionStaffNicknameByName: async (nickname: string) => {
      staffNicknameLookups.push(nickname);
      if (!allowedNicknames.includes(nickname)) {
        return null;
      }

      return {
        id: `nickname-${nickname.toLowerCase().replace(/\s+/g, "-")}`,
        nickname,
        isActive: true,
        roleScope: "both",
        createdBy: "superuser",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [{ month: 3, monthName: "March", totalRecords: 2, totalAmount: 420.75 }];
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 2,
        totalAmount: 420.75,
      };
    },
    summarizeCollectionRecordsByNickname: async (_filters: Record<string, unknown>) => {
      return [
        {
          nickname: "Collector Beta",
          totalRecords: 2,
          totalAmount: 420.75,
        },
      ];
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-admin-summary-1",
          customerName: "Admin Scoped Customer",
          icNumber: "900101015555",
          customerPhone: "0123456789",
          accountNumber: "ACC-3001",
          batch: "P10",
          paymentDate: "2026-03-10",
          amount: "210.25",
          receiptFile: null,
          receipts: [],
          createdByLogin: "staff.user",
          collectionStaffNickname: "Collector Beta",
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    allowedNicknames,
    monthlySummaryCalls,
    nicknameSummaryCalls,
    nicknameListCalls,
    sessionActivityCalls,
    groupLeaderCalls,
    staffNicknameLookups,
  };
}

export function createAdminCollectionNoVisibilityStorageDouble() {
  const monthlySummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameSummaryCalls: Array<Record<string, unknown>> = [];
  const nicknameListCalls: Array<Record<string, unknown>> = [];
  const sessionActivityCalls: string[] = [];
  const groupLeaderCalls: string[] = [];
  const staffNicknameLookups: string[] = [];

  const storage = {
    getCollectionNicknameSessionByActivity: async (activityId: string) => {
      sessionActivityCalls.push(activityId);
      return null;
    },
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async (leaderNickname: string) => {
      groupLeaderCalls.push(leaderNickname);
      return [];
    },
    getCollectionStaffNicknameByName: async (nickname: string) => {
      staffNicknameLookups.push(nickname);
      return null;
    },
    getCollectionMonthlySummary: async (filters: Record<string, unknown>) => {
      monthlySummaryCalls.push(filters);
      return [{ month: 3, monthName: "March", totalRecords: 99, totalAmount: 9999 }];
    },
    summarizeCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameSummaryCalls.push(filters);
      return {
        totalRecords: 99,
        totalAmount: 9999,
      };
    },
    listCollectionRecords: async (filters: Record<string, unknown>) => {
      nicknameListCalls.push(filters);
      return [
        {
          id: "collection-admin-no-visibility-1",
          customerName: "Should Not Load",
          icNumber: "900101015555",
          customerPhone: "0123456789",
          accountNumber: "ACC-4001",
          batch: "P10",
          paymentDate: "2026-03-10",
          amount: "9999.00",
          receiptFile: null,
          receipts: [],
          createdByLogin: "staff.user",
          collectionStaffNickname: "Collector Hidden",
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
        },
      ];
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    monthlySummaryCalls,
    nicknameSummaryCalls,
    nicknameListCalls,
    sessionActivityCalls,
    groupLeaderCalls,
    staffNicknameLookups,
  };
}
