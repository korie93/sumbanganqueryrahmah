import crypto from "crypto";
import type { InsertUserActivity, UserActivity } from "../../shared/schema-postgres";
import {
  createCurrentTimestampSql,
  shouldUseDatabaseCurrentTimestamp,
} from "./activity-repository-timestamp-shared";

export function buildCreateActivityValues(data: InsertUserActivity, id: string = crypto.randomUUID()) {
  const currentTimestamp = createCurrentTimestampSql();

  return {
    id,
    userId: data.userId,
    username: data.username,
    role: data.role,
    pcName: data.pcName ?? null,
    browser: data.browser ?? null,
    fingerprint: data.fingerprint ?? null,
    ipAddress: data.ipAddress ?? null,
    loginTime: currentTimestamp,
    logoutTime: null,
    lastActivityTime: currentTimestamp,
    isActive: true,
    logoutReason: null,
  };
}

export function buildUpdateActivityValues(
  data: Partial<UserActivity>,
  referenceNowMs: number = Date.now(),
) {
  const updateData: Record<string, unknown> = {};

  if (data.lastActivityTime !== undefined) {
    updateData.lastActivityTime =
      data.lastActivityTime === null
        ? null
        : shouldUseDatabaseCurrentTimestamp(data.lastActivityTime, referenceNowMs)
          ? createCurrentTimestampSql()
          : data.lastActivityTime;
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  if (data.logoutTime !== undefined) {
    updateData.logoutTime =
      data.logoutTime === null
        ? null
        : shouldUseDatabaseCurrentTimestamp(data.logoutTime, referenceNowMs)
          ? createCurrentTimestampSql()
          : data.logoutTime;
  }

  if (data.logoutReason !== undefined) {
    updateData.logoutReason = data.logoutReason;
  }

  return updateData;
}
