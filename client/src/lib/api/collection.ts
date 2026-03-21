import { apiRequest } from "../queryClient";

export type CollectionBatch = "P10" | "P25" | "MDD02" | "MDD10" | "MDD18" | "MDD25";

export type CollectionRecordReceipt = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  createdAt: string;
};

export type CollectionRecord = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  receiptFile: string | null;
  receipts: CollectionRecordReceipt[];
  createdByLogin: string;
  collectionStaffNickname: string;
  createdAt: string;
};

export type CollectionStaffNickname = {
  id: string;
  nickname: string;
  isActive: boolean;
  roleScope: "admin" | "user" | "both";
  createdBy: string | null;
  createdAt: string;
};

export type CollectionAdminUser = {
  id: string;
  username: string;
  role: "admin";
  isBanned: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionAdminGroup = {
  id: string;
  leaderNickname: string;
  leaderNicknameId: string | null;
  leaderIsActive: boolean;
  leaderRoleScope: "admin" | "user" | "both" | null;
  memberNicknames: string[];
  memberNicknameIds: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionReceiptPayload = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export type CreateCollectionPayload = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: number;
  collectionStaffNickname: string;
  receipt?: CollectionReceiptPayload | null;
  receipts?: CollectionReceiptPayload[] | null;
};

export type UpdateCollectionPayload = Partial<CreateCollectionPayload> & {
  removeReceipt?: boolean;
  removeReceiptIds?: string[];
};

export type CollectionRecordListResponse = {
  ok: boolean;
  records: CollectionRecord[];
  total: number;
  totalAmount: number;
  limit: number;
  offset: number;
};

export type CollectionPurgeSummaryResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  eligibleRecords: number;
  totalAmount: number;
};

export type CollectionPurgeResponse = {
  ok: boolean;
  retentionMonths: number;
  cutoffDate: string;
  deletedRecords: number;
  totalAmount: number;
};

export async function createCollectionRecord(payload: CreateCollectionPayload) {
  const response = await apiRequest("POST", "/api/collection", payload);
  return response.json();
}

export async function getCollectionRecords(filters?: {
  from?: string;
  to?: string;
  search?: string;
  nickname?: string;
  nicknames?: string[];
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.nickname) params.set("nickname", filters.nickname);
  if (Array.isArray(filters?.nicknames) && filters.nicknames.length > 0) {
    params.set(
      "nicknames",
      filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (typeof filters?.limit === "number" && Number.isFinite(filters.limit)) {
    params.set("limit", String(filters.limit));
  }
  if (typeof filters?.offset === "number" && Number.isFinite(filters.offset)) {
    params.set("offset", String(filters.offset));
  }
  const query = params.toString();
  const response = await apiRequest("GET", query ? `/api/collection/list?${query}` : "/api/collection/list");
  return response.json() as Promise<CollectionRecordListResponse>;
}

export async function getCollectionPurgeSummary() {
  const response = await apiRequest("GET", "/api/collection/purge-summary");
  return response.json() as Promise<CollectionPurgeSummaryResponse>;
}

export async function purgeOldCollectionRecords(currentPassword: string) {
  const response = await apiRequest("DELETE", "/api/collection/purge-old", {
    currentPassword,
  });
  return response.json() as Promise<CollectionPurgeResponse>;
}

function parseFilenameFromContentDisposition(contentDisposition: string | null): string | null {
  const raw = String(contentDisposition || "").trim();
  if (!raw) return null;

  const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]).trim() || null;
    } catch {
      return utfMatch[1].trim() || null;
    }
  }

  const fallbackMatch = raw.match(/filename=\"?([^\";]+)\"?/i);
  if (!fallbackMatch?.[1]) return null;
  const normalized = fallbackMatch[1].trim();
  return normalized || null;
}

export async function fetchCollectionReceiptBlob(
  recordId: string,
  mode: "view" | "download",
  receiptId?: string | null,
  options?: { signal?: AbortSignal },
) {
  const receiptSegment = receiptId
    ? `/receipts/${encodeURIComponent(receiptId)}`
    : "/receipt";
  const response = await apiRequest(
    "GET",
    `/api/collection/${encodeURIComponent(recordId)}${receiptSegment}/${mode}`,
    undefined,
    { signal: options?.signal },
  );
  const blob = await response.blob();
  const mimeType = String(response.headers.get("Content-Type") || blob.type || "").toLowerCase();
  const fileName = parseFilenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { blob, mimeType, fileName };
}

export type CollectionMonthlySummary = {
  month: number;
  monthName: string;
  totalRecords: number;
  totalAmount: number;
};

export async function getCollectionMonthlySummary(filters: { year: number; nickname?: string; nicknames?: string[] }) {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  const nicknameList = Array.isArray(filters.nicknames)
    ? filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (nicknameList.length > 0) {
    params.set("nicknames", nicknameList.join(","));
  }
  if (filters.nickname && filters.nickname.trim()) {
    params.set("nickname", filters.nickname.trim());
  }
  const response = await apiRequest("GET", `/api/collection/summary?${params.toString()}`);
  return response.json() as Promise<{ ok: boolean; year: number; summary: CollectionMonthlySummary[] }>;
}

export async function getCollectionNicknameSummary(filters: {
  from?: string;
  to?: string;
  nicknames: string[];
  summaryOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set(
    "nicknames",
    filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
  );
  if (filters.summaryOnly) {
    params.set("summaryOnly", "1");
  }
  const response = await apiRequest("GET", `/api/collection/nickname-summary?${params.toString()}`);
  return response.json() as Promise<{
    ok: boolean;
    nicknames: string[];
    totalRecords: number;
    totalAmount: number;
    nicknameTotals: Array<{
      nickname: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    records: CollectionRecord[];
  }>;
}

export type CollectionDailyUser = {
  id: string;
  username: string;
  role: string;
};

export type CollectionDailyOverviewDay = {
  day: number;
  date: string;
  amount: number;
  target: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  customerCount: number;
  status: "green" | "yellow" | "red" | "neutral";
};

export type CollectionDailyOverviewResponse = {
  ok: boolean;
  username: string;
  usernames: string[];
  role: string;
  month: {
    year: number;
    month: number;
    daysInMonth: number;
  };
  summary: {
    monthlyTarget: number;
    collectedAmount: number;
    balancedAmount: number;
    workingDays: number;
    elapsedWorkingDays: number;
    remainingWorkingDays: number;
    completedDays: number;
    incompleteDays: number;
    noCollectionDays: number;
    neutralDays: number;
    baseDailyTarget: number;
    dailyTarget: number;
    expectedProgressAmount: number;
    progressVarianceAmount: number;
    achievedAmount: number;
    remainingAmount: number;
    metDays: number;
    yellowDays: number;
    redDays: number;
  };
  days: CollectionDailyOverviewDay[];
  carryForwardRule?: string;
};

export type CollectionDailyDayDetailsResponse = {
  ok: boolean;
  username: string;
  usernames: string[];
  date: string;
  status: "green" | "yellow" | "red" | "neutral";
  message: string;
  amount: number;
  dailyTarget: number;
  customers: Array<{
    id: string;
    customerName: string;
    accountNumber: string;
    amount: number;
    collectionStaffNickname: string;
  }>;
  summary: {
    monthlyTarget: number;
    collected: number;
    balanced: number;
    totalForDate: number;
    targetForDate: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  records: Array<{
    id: string;
    customerName: string;
    accountNumber: string;
    paymentDate: string;
    amount: number;
    batch: string;
    paymentReference: string;
    username: string;
    collectionStaffNickname: string;
    createdAt: string;
    receiptFile: string | null;
    receipts: Array<{
      id: string;
      originalFileName: string;
      originalMimeType: string;
      fileSize: number;
      createdAt: string;
    }>;
  }>;
};

export async function getCollectionDailyUsers() {
  const response = await apiRequest("GET", "/api/collection/daily/users");
  return response.json() as Promise<{ ok: boolean; users: CollectionDailyUser[] }>;
}

export async function setCollectionDailyTarget(payload: {
  username: string;
  year: number;
  month: number;
  monthlyTarget: number;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/target", payload);
  return response.json() as Promise<{
    ok: boolean;
    target: {
      id: string;
      username: string;
      year: number;
      month: number;
      monthlyTarget: number;
    };
  }>;
}

export async function setCollectionDailyCalendar(payload: {
  year: number;
  month: number;
  days: Array<{
    day: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/calendar", payload);
  return response.json() as Promise<{ ok: boolean; calendar: Array<Record<string, unknown>> }>;
}

export async function getCollectionDailyOverview(filters: {
  year: number;
  month: number;
  username?: string;
  usernames?: string[];
}) {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  params.set("month", String(filters.month));
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  const response = await apiRequest("GET", `/api/collection/daily/overview?${params.toString()}`);
  return response.json() as Promise<CollectionDailyOverviewResponse>;
}

export async function getCollectionDailyDayDetails(filters: {
  date: string;
  username?: string;
  usernames?: string[];
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  params.set("date", filters.date);
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  if (typeof filters.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(filters.page));
  }
  if (typeof filters.pageSize === "number" && Number.isFinite(filters.pageSize)) {
    params.set("pageSize", String(filters.pageSize));
  }
  const response = await apiRequest("GET", `/api/collection/daily/day-details?${params.toString()}`);
  return response.json() as Promise<CollectionDailyDayDetailsResponse>;
}

export async function getCollectionNicknames(filters?: { includeInactive?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.includeInactive) {
    params.set("includeInactive", "1");
  }
  const query = params.toString();
  const response = await apiRequest("GET", query ? `/api/collection/nicknames?${query}` : "/api/collection/nicknames");
  return response.json() as Promise<{ ok: boolean; nicknames: CollectionStaffNickname[] }>;
}

export type CollectionNicknameAuthCheckResult = {
  ok: boolean;
  nickname: {
    id: string;
    nickname: string;
    mustChangePassword: boolean;
    passwordResetBySuperuser: boolean;
    requiresPasswordSetup: boolean;
    requiresPasswordLogin: boolean;
    requiresForcedPasswordChange: boolean;
  };
};

export async function checkCollectionNicknameAuth(nickname: string) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/check", { nickname });
  return response.json() as Promise<CollectionNicknameAuthCheckResult>;
}

export async function setupCollectionNicknamePassword(payload: {
  nickname: string;
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/setup-password", payload);
  return response.json() as Promise<{
    ok: boolean;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
    };
  }>;
}

export async function loginCollectionNickname(payload: { nickname: string; password: string }) {
  const response = await apiRequest("POST", "/api/collection/nickname-auth/login", payload);
  return response.json() as Promise<{
    ok: boolean;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
      requiresForcedPasswordChange: boolean;
    };
  }>;
}

export async function createCollectionNickname(payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("POST", "/api/collection/nicknames", payload);
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function updateCollectionNickname(id: string, payload: { nickname: string; roleScope?: "admin" | "user" | "both" }) {
  const response = await apiRequest("PUT", `/api/collection/nicknames/${encodeURIComponent(id)}`, payload);
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function setCollectionNicknameStatus(id: string, isActive: boolean) {
  const response = await apiRequest("PATCH", `/api/collection/nicknames/${encodeURIComponent(id)}`, { isActive });
  return response.json() as Promise<{ ok: boolean; nickname: CollectionStaffNickname }>;
}

export async function deleteCollectionNickname(id: string) {
  const response = await apiRequest("DELETE", `/api/collection/nicknames/${encodeURIComponent(id)}`);
  return response.json() as Promise<{ ok: boolean; deleted: boolean; deactivated: boolean }>;
}

export async function resetCollectionNicknamePassword(id: string) {
  const response = await apiRequest("POST", `/api/collection/nicknames/${encodeURIComponent(id)}/reset-password`);
  return response.json() as Promise<{
    ok: boolean;
    nickname: {
      id: string;
      nickname: string;
      mustChangePassword: boolean;
      passwordResetBySuperuser: boolean;
    };
  }>;
}

export async function getCollectionAdmins() {
  const response = await apiRequest("GET", "/api/collection/admins");
  return response.json() as Promise<{ ok: boolean; admins: CollectionAdminUser[] }>;
}

export async function getCollectionNicknameAssignments(adminId: string) {
  const response = await apiRequest("GET", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`);
  return response.json() as Promise<{ ok: boolean; admin: CollectionAdminUser; nicknameIds: string[] }>;
}

export async function saveCollectionNicknameAssignments(adminId: string, nicknameIds: string[]) {
  const response = await apiRequest("PUT", `/api/collection/nickname-assignments/${encodeURIComponent(adminId)}`, {
    nicknameIds,
  });
  return response.json() as Promise<{ ok: boolean; adminId: string; nicknameIds: string[] }>;
}

export async function getCollectionAdminGroups() {
  const response = await apiRequest("GET", "/api/collection/admin-groups");
  return response.json() as Promise<{ ok: boolean; groups: CollectionAdminGroup[] }>;
}

export async function createCollectionAdminGroup(payload: {
  leaderNicknameId: string;
  memberNicknameIds?: string[];
}) {
  const response = await apiRequest("POST", "/api/collection/admin-groups", payload);
  return response.json() as Promise<{ ok: boolean; group: CollectionAdminGroup }>;
}

export async function updateCollectionAdminGroup(
  groupId: string,
  payload: {
    leaderNicknameId?: string;
    memberNicknameIds?: string[];
  },
) {
  const response = await apiRequest("PUT", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`, payload);
  return response.json() as Promise<{ ok: boolean; group: CollectionAdminGroup }>;
}

export async function deleteCollectionAdminGroup(groupId: string) {
  const response = await apiRequest("DELETE", `/api/collection/admin-groups/${encodeURIComponent(groupId)}`);
  return response.json() as Promise<{ ok: boolean }>;
}

export async function updateCollectionRecord(id: string, payload: UpdateCollectionPayload) {
  const response = await apiRequest("PATCH", `/api/collection/${encodeURIComponent(id)}`, payload);
  return response.json();
}

export async function deleteCollectionRecord(id: string) {
  const response = await apiRequest("DELETE", `/api/collection/${encodeURIComponent(id)}`);
  return response.json();
}
