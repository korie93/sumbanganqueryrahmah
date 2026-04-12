import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CollectionRepositoryQueryResult } from "./collection-nickname-utils";
import type {
  CollectionAdminGroupExecutor,
  CollectionNicknameIdRow,
} from "./collection-admin-group-types";

export function normalizeCollectionText(value: unknown): string {
  return String(value || "").trim();
}

export function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
  return readRows<TRow>(result)[0];
}

export function buildNicknameIdByLowerName(rows: CollectionNicknameIdRow[]): Map<string, string> {
  const nicknameIdByLowerName = new Map<string, string>();
  for (const row of rows) {
    const nickname = normalizeCollectionText(row.nickname).toLowerCase();
    const id = normalizeCollectionText(row.id);
    if (!nickname || !id || nicknameIdByLowerName.has(nickname)) continue;
    nicknameIdByLowerName.set(nickname, id);
  }
  return nicknameIdByLowerName;
}

export async function insertAdminGroupMembers(
  executor: CollectionAdminGroupExecutor,
  groupId: string,
  leaderNickname: string,
  memberNicknames: string[],
) {
  const normalizedLeader = leaderNickname.toLowerCase();
  for (const memberNickname of memberNicknames) {
    if (!memberNickname || memberNickname.toLowerCase() === normalizedLeader) continue;
    await executor.execute(sql`
      INSERT INTO public.admin_group_members (
        id,
        admin_group_id,
        member_nickname,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${groupId}::uuid,
        ${memberNickname},
        now()
      )
      ON CONFLICT DO NOTHING
    `);
  }
}

export function normalizeVisibleNicknameValues(
  leaderNickname: string,
  memberNicknames: unknown,
): string[] {
  const normalizedLeader = normalizeCollectionText(leaderNickname);
  const lowerLeader = normalizedLeader.toLowerCase();
  const members: string[] = Array.isArray(memberNicknames)
    ? memberNicknames.map((value: unknown) => normalizeCollectionText(value)).filter(Boolean)
    : [];
  const uniqueMembers = Array.from(new Set(members.filter((value) => value.toLowerCase() !== lowerLeader))).sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  return [normalizedLeader, ...uniqueMembers];
}
