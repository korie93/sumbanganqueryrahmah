import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  mapBannedUserRow,
  type ActivityRepositoryOptions,
  type BannedUserWithInfo,
} from "./activity-repository-shared";

export async function getBannedUsers(): Promise<BannedUserWithInfo[]> {
  const result = await db.execute(sql`
    SELECT
      u.*,
      ban.ip_address as "banIpAddress",
      ban.browser as "banBrowser",
      ban.logout_time as "banLogoutTime"
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT
        ua.ip_address,
        ua.browser,
        ua.logout_time
      FROM public.user_activity ua
      WHERE lower(ua.username) = lower(u.username)
        AND ua.logout_reason = 'BANNED'
      ORDER BY ua.logout_time DESC NULLS LAST
      LIMIT 1
    ) ban ON true
    WHERE u.is_banned = true
    ORDER BY u.username ASC
  `);

  return (result.rows || []).map(mapBannedUserRow);
}

export async function isVisitorBanned(
  options: ActivityRepositoryOptions,
  fingerprint?: string | null,
  ipAddress?: string | null,
  username?: string | null,
): Promise<boolean> {
  await options.ensureBannedSessionsTable();
  if (!username || (!fingerprint && !ipAddress)) return false;

  const result = await db.execute(sql`
    SELECT id
    FROM public.banned_sessions
    WHERE lower(username) = lower(${username})
      AND (
        (${fingerprint ?? null}::text IS NOT NULL AND fingerprint = ${fingerprint ?? null}::text)
        OR (${ipAddress ?? null}::text IS NOT NULL AND ip_address = ${ipAddress ?? null}::text)
      )
    LIMIT 1
  `);

  return (result.rows?.length || 0) > 0;
}

export async function banVisitor(
  options: ActivityRepositoryOptions,
  params: {
    username: string;
    role: string;
    activityId: string;
    fingerprint?: string | null;
    ipAddress?: string | null;
    browser?: string | null;
    pcName?: string | null;
  },
): Promise<void> {
  await options.ensureBannedSessionsTable();
  const banId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO public.banned_sessions
      (id, username, role, activity_id, fingerprint, ip_address, browser, pc_name, banned_at)
    VALUES
      (${banId}, ${params.username}, ${params.role}, ${params.activityId},
       ${params.fingerprint ?? null}, ${params.ipAddress ?? null}, ${params.browser ?? null}, ${params.pcName ?? null},
       ${new Date()})
    ON CONFLICT DO NOTHING
  `);
}

export async function unbanVisitor(
  options: ActivityRepositoryOptions,
  banId: string,
): Promise<void> {
  await options.ensureBannedSessionsTable();
  await db.execute(sql`DELETE FROM public.banned_sessions WHERE id = ${banId}`);
}

export async function getBannedSessions(options: ActivityRepositoryOptions): Promise<Array<{
  banId: string;
  username: string;
  role: string;
  fingerprint: string | null;
  ipAddress: string | null;
  browser: string | null;
  bannedAt: Date | null;
}>> {
  await options.ensureBannedSessionsTable();
  const result = await db.execute(sql`
    SELECT
      id as "banId",
      username,
      role,
      fingerprint,
      ip_address as "ipAddress",
      browser,
      banned_at as "bannedAt"
    FROM public.banned_sessions
    ORDER BY banned_at DESC
  `);

  return (result.rows || []) as Array<{
    banId: string;
    username: string;
    role: string;
    fingerprint: string | null;
    ipAddress: string | null;
    browser: string | null;
    bannedAt: Date | null;
  }>;
}
