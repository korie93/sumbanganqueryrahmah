import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { badRequest, notFound } from "../http/errors";
import type { CollectionStaffNicknameExecutor } from "./collection-staff-nickname-shared";

export type DashboardAccountLink = {
  nicknameId: string | null;
  nickname: string | null;
  accountRole: string;
  isActive: boolean;
};

export async function readDashboardAccountLink(executor: CollectionStaffNicknameExecutor, userId: string): Promise<DashboardAccountLink | null> {
  const result = await executor.execute(sql`
    SELECT l.nickname_id, n.nickname, l.account_role,
      (n.is_active = true AND n.role_scope IN (u.role, 'both')
        AND l.account_role = u.role AND u.status <> 'deleted') AS is_active
    FROM public.collection_dashboard_accounts l
    JOIN public.users u ON u.id = l.user_id
    LEFT JOIN public.collection_staff_nicknames n ON n.id = l.nickname_id
    WHERE l.user_id = ${userId} LIMIT 1
  `);
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  return row ? {
    nicknameId: typeof row.nickname_id === "string" ? row.nickname_id : null,
    nickname: typeof row.nickname === "string" ? row.nickname : null,
    accountRole: String(row.account_role),
    isActive: row.is_active === true,
  } : null;
}

export function getCollectionDashboardAccount(userId: string) {
  return readDashboardAccountLink(db, userId);
}

/** Called inside the password-verified session transaction, never from a browser hint. */
export async function rememberDashboardAccount(executor: CollectionStaffNicknameExecutor, activityId: string) {
  await executor.execute(sql`
    INSERT INTO public.collection_dashboard_accounts (user_id, nickname_id, account_role, source)
    SELECT u.id, n.id, u.role, 'verified_login'
    FROM public.collection_nickname_sessions s
    JOIN public.user_activity a ON a.id = s.activity_id AND a.is_active = true
    JOIN public.users u ON u.id = a.user_id
      AND lower(u.username) = lower(s.username) AND u.role = s.user_role AND a.role = u.role
    JOIN public.collection_staff_nicknames n ON lower(n.nickname) = lower(s.nickname)
    WHERE s.activity_id = ${activityId}
      AND u.role IN ('user', 'admin') AND u.status = 'active' AND coalesce(u.is_banned, false) = false
      AND n.is_active = true AND n.role_scope IN (u.role, 'both')
      AND n.nickname_password_hash IS NOT NULL
      AND n.must_change_password = false AND n.password_reset_by_superuser = false
      AND (n.password_updated_at IS NULL OR s.verified_at >= n.password_updated_at)
    ON CONFLICT (user_id) DO NOTHING
  `);
}

export type SetDashboardAccountInput = {
  userId: string;
  nicknameId: string | null;
  actor: string;
};

export function setCollectionDashboardAccount(input: SetDashboardAccountInput) {
  return db.transaction(async (tx) => {
    // Serialize role/deletion changes with assignment. A deliberate unlink is a
    // retained null row, so a subsequent nickname login cannot undo revocation.
    const target = await tx.execute(sql`SELECT role FROM public.users
      WHERE id = ${input.userId} AND status <> 'deleted' FOR UPDATE`);
    const role = (target.rows[0] as { role?: string } | undefined)?.role;
    if (!role) throw notFound("Account not found.");
    if (role !== "user" && role !== "admin") throw badRequest("This role already sees all Collection totals.");
    if (input.nicknameId !== null) {
      const profile = await tx.execute(sql`SELECT id FROM public.collection_staff_nicknames
        WHERE id = ${input.nicknameId}::uuid AND is_active = true AND role_scope IN (${role}, 'both') FOR SHARE`);
      if (!profile.rows.length) throw badRequest("Choose an active nickname allowed for this account role.");
    }
    await tx.execute(sql`INSERT INTO public.collection_dashboard_accounts
      (user_id, nickname_id, account_role, source) VALUES (${input.userId}, ${input.nicknameId}::uuid, ${role}, 'superuser')
      ON CONFLICT (user_id) DO UPDATE SET nickname_id = EXCLUDED.nickname_id,
        account_role = EXCLUDED.account_role, source = 'superuser', updated_at = now()`);
    await tx.execute(sql`INSERT INTO public.audit_logs (id, action, performed_by, target_user, details)
      VALUES (${randomUUID()}, 'COLLECTION_DASHBOARD_ACCOUNT_LINK_UPDATED', ${input.actor}, ${input.userId},
        ${JSON.stringify({ nicknameId: input.nicknameId, role })})`);
    return readDashboardAccountLink(tx, input.userId);
  });
}
