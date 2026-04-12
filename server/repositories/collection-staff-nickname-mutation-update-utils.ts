import { sql, type SQL } from "drizzle-orm";
import { normalizeCollectionNicknameRoleScope } from "./collection-nickname-utils";
import type { UpdateCollectionStaffNicknameInput } from "../storage-postgres";

export function buildCollectionStaffNicknameUpdateAssignments(
  data: UpdateCollectionStaffNicknameInput,
): SQL[] {
  const updates: SQL[] = [];

  if (data.nickname !== undefined) {
    updates.push(sql`nickname = ${data.nickname}`);
  }
  if (data.isActive !== undefined) {
    updates.push(sql`is_active = ${data.isActive}`);
  }
  if (data.roleScope !== undefined) {
    updates.push(sql`role_scope = ${normalizeCollectionNicknameRoleScope(data.roleScope)}`);
  }

  return updates;
}
