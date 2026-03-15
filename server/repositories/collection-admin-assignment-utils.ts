import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { mapCollectionStaffNicknameRow } from "./collection-nickname-utils";
import type { CollectionStaffNickname } from "../storage-postgres";

export type CollectionAdminAssignmentExecutor = {
  execute: (query: any) => Promise<any>;
};

function normalizeUniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export async function listCollectionAdminAssignedNicknameIds(
  executor: CollectionAdminAssignmentExecutor,
  adminUserId: string,
): Promise<string[]> {
  const normalized = String(adminUserId || "").trim();
  if (!normalized) return [];

  const result = await executor.execute(sql`
    SELECT avn.nickname_id
    FROM public.admin_visible_nicknames avn
    WHERE avn.admin_user_id = ${normalized}
    ORDER BY avn.nickname_id ASC
    LIMIT 5000
  `);
  return (result.rows || [])
    .map((row: any) => String(row.nickname_id || "").trim())
    .filter(Boolean);
}

export async function listCollectionAdminVisibleNicknames(
  executor: CollectionAdminAssignmentExecutor,
  adminUserId: string,
  filters?: { activeOnly?: boolean; allowedRole?: "admin" | "user" },
): Promise<CollectionStaffNickname[]> {
  const normalized = String(adminUserId || "").trim();
  if (!normalized) return [];

  const conditions: any[] = [sql`avn.admin_user_id = ${normalized}`];
  if (filters?.activeOnly === true) {
    conditions.push(sql`n.is_active = true`);
  }
  if (filters?.allowedRole === "admin") {
    conditions.push(sql`n.role_scope IN ('admin', 'both')`);
  } else if (filters?.allowedRole === "user") {
    conditions.push(sql`n.role_scope IN ('user', 'both')`);
  }
  const whereSql = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const result = await executor.execute(sql`
    SELECT
      n.id,
      n.nickname,
      n.is_active,
      n.role_scope,
      n.created_by,
      n.created_at
    FROM public.admin_visible_nicknames avn
    INNER JOIN public.collection_staff_nicknames n
      ON n.id = avn.nickname_id
    INNER JOIN public.users u
      ON u.id = avn.admin_user_id
     AND u.role = 'admin'
    ${whereSql}
    ORDER BY n.is_active DESC, lower(n.nickname) ASC
    LIMIT 1000
  `);

  return (result.rows || []).map((row: any) => mapCollectionStaffNicknameRow(row));
}

async function resolveValidCollectionNicknameIds(
  executor: CollectionAdminAssignmentExecutor,
  nicknameIds: string[],
): Promise<string[]> {
  const normalizedNicknameIds = normalizeUniqueValues(nicknameIds);
  if (!normalizedNicknameIds.length) {
    return [];
  }

  const nicknameSql = sql.join(
    normalizedNicknameIds.map((value) => sql`${value}::uuid`),
    sql`, `,
  );
  const validRows = await executor.execute(sql`
    SELECT id
    FROM public.collection_staff_nicknames
    WHERE id IN (${nicknameSql})
    LIMIT 5000
  `);
  const validNicknameIds = (validRows.rows || [])
    .map((row: any) => String(row.id || "").trim())
    .filter(Boolean);
  if (validNicknameIds.length !== normalizedNicknameIds.length) {
    throw new Error("Invalid nickname ids.");
  }
  return validNicknameIds;
}

export async function replaceCollectionAdminAssignedNicknameIds(
  executor: CollectionAdminAssignmentExecutor,
  params: {
    adminUserId: string;
    nicknameIds: string[];
    createdBySuperuser: string;
  },
): Promise<string[]> {
  const adminUserId = String(params.adminUserId || "").trim();
  const createdBySuperuser = String(params.createdBySuperuser || "").trim();
  if (!adminUserId) {
    throw new Error("adminUserId is required.");
  }
  if (!createdBySuperuser) {
    throw new Error("createdBySuperuser is required.");
  }

  const adminCheck = await executor.execute(sql`
    SELECT id
    FROM public.users
    WHERE id = ${adminUserId}
      AND role = 'admin'
    LIMIT 1
  `);
  if (!adminCheck.rows?.[0]) {
    throw new Error("Admin user not found.");
  }

  const validNicknameIds = await resolveValidCollectionNicknameIds(executor, params.nicknameIds);

  await executor.execute(sql`
    DELETE FROM public.admin_visible_nicknames
    WHERE admin_user_id = ${adminUserId}
  `);

  for (const nicknameId of validNicknameIds) {
    await executor.execute(sql`
      INSERT INTO public.admin_visible_nicknames (
        id,
        admin_user_id,
        nickname_id,
        created_by_superuser,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${adminUserId},
        ${nicknameId}::uuid,
        ${createdBySuperuser},
        now()
      )
      ON CONFLICT (admin_user_id, nickname_id) DO NOTHING
    `);
  }

  return listCollectionAdminAssignedNicknameIds(executor, adminUserId);
}
