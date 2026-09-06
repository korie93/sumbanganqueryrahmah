import { sql } from "drizzle-orm";
import { badRequest } from "../http/errors";
import { isValidCollectionDate } from "../routes/collection.validation";
import { lockCollectionRecordRollupSlices, refreshCollectionRecordMonthlyRollupSlice } from "./collection-record-rollup-refresh-utils";
import type { CollectionRecordDailyRollupSlice, CollectionRepositoryExecutor } from "./collection-record-rollup-types";

export type BoundedCollectionRollupRepair = {
  mode: "bounded";
  from: string;
  to: string;
  createdByLogin: string;
  collectionStaffNickname: string;
  dryRun: boolean;
  maxSlices: number;
};

/** Explicit administrative repair only; never an automatic deployment backfill. */
export function parseBoundedCollectionRollupRepair(value: unknown): BoundedCollectionRollupRepair {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("A bounded rollup repair object is required.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["mode", "from", "to", "createdByLogin", "collectionStaffNickname", "dryRun", "maxSlices"]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || input.mode !== "bounded") {
    throw badRequest("Specify mode bounded and only supported rollup repair fields.");
  }
  const from = typeof input.from === "string" ? input.from : "";
  const to = typeof input.to === "string" ? input.to : "";
  if (!isValidCollectionDate(from) || !isValidCollectionDate(to) || from > to
    || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 365 * 86_400_000) {
    throw badRequest("Rollup repair requires ordered YYYY-MM-DD dates covering at most 366 days.");
  }
  const createdByLogin = typeof input.createdByLogin === "string" ? input.createdByLogin.trim() : "";
  const collectionStaffNickname = typeof input.collectionStaffNickname === "string" ? input.collectionStaffNickname.trim() : "";
  if (!createdByLogin || createdByLogin.length > 200 || !collectionStaffNickname || collectionStaffNickname.length > 200) {
    throw badRequest("Rollup repair requires one exact creator login and staff nickname.");
  }
  const maxSlices = input.maxSlices ?? 100;
  if (typeof maxSlices !== "number" || !Number.isInteger(maxSlices) || maxSlices < 1 || maxSlices > 366) {
    throw badRequest("Rollup repair maxSlices must be an integer between 1 and 366.");
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw badRequest("Rollup repair dryRun must be boolean.");
  return { mode: "bounded", from, to, createdByLogin, collectionStaffNickname, dryRun: input.dryRun !== false, maxSlices };
}

function affectedMonths(input: BoundedCollectionRollupRepair): CollectionRecordDailyRollupSlice[] {
  const slices: CollectionRecordDailyRollupSlice[] = [];
  const date = new Date(`${input.from.slice(0, 7)}-01T00:00:00Z`);
  while (date.toISOString().slice(0, 10) <= input.to) {
    slices.push({ paymentDate: date.toISOString().slice(0, 10), createdByLogin: input.createdByLogin, collectionStaffNickname: input.collectionStaffNickname });
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return slices;
}

export async function repairBoundedCollectionRecordRollups(executor: CollectionRepositoryExecutor, rawInput: BoundedCollectionRollupRepair) {
  const input = parseBoundedCollectionRollupRepair(rawInput);
  const months = affectedMonths(input);
  await lockCollectionRecordRollupSlices(executor, months);
  const scope = sql`payment_date BETWEEN ${input.from}::date AND ${input.to}::date
    AND created_by_login = ${input.createdByLogin} AND collection_staff_nickname = ${input.collectionStaffNickname}`;
  const monthScope = sql`make_date(year, month, 1) BETWEEN date_trunc('month', ${input.from}::date)::date AND ${input.to}::date
    AND created_by_login = ${input.createdByLogin} AND collection_staff_nickname = ${input.collectionStaffNickname}`;
  const countResult = await executor.execute(sql`
    SELECT COUNT(*)::integer AS count FROM (
      SELECT payment_date FROM public.collection_records WHERE ${scope}
      UNION SELECT payment_date FROM public.collection_record_daily_rollups WHERE ${scope}
      UNION SELECT payment_date FROM public.collection_record_daily_rollup_refresh_queue WHERE ${scope}
    ) slices
  `);
  const sliceCount = Number(countResult.rows?.[0]?.count ?? 0);
  if (sliceCount > input.maxSlices) throw badRequest("Rollup repair exceeds maxSlices; choose a smaller date range.");
  const readCounts = async () => {
    const result = await executor.execute(sql`
      SELECT
        (SELECT COUNT(*)::integer FROM public.collection_records WHERE ${scope}) AS canonical_records,
        (SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text FROM public.collection_records WHERE ${scope}) AS canonical_amount,
        (SELECT COALESCE(SUM(total_records), 0)::integer FROM public.collection_record_daily_rollups WHERE ${scope}) AS daily_records,
        (SELECT COALESCE(SUM(total_amount), 0)::numeric(14,2)::text FROM public.collection_record_daily_rollups WHERE ${scope}) AS daily_amount,
        (SELECT COALESCE(SUM(total_records), 0)::integer FROM public.collection_record_monthly_rollups WHERE ${monthScope}) AS monthly_records,
        (SELECT COALESCE(SUM(total_amount), 0)::numeric(14,2)::text FROM public.collection_record_monthly_rollups WHERE ${monthScope}) AS monthly_amount
    `);
    return result.rows?.[0] ?? {};
  };
  const before = await readCounts();
  if (!input.dryRun) {
    await executor.execute(sql`
      DELETE FROM public.collection_record_daily_rollups rollup WHERE ${scope} AND NOT EXISTS (
        SELECT 1 FROM public.collection_records record WHERE record.payment_date = rollup.payment_date
          AND record.created_by_login = rollup.created_by_login AND record.collection_staff_nickname = rollup.collection_staff_nickname
      )
    `);
    await executor.execute(sql`
      INSERT INTO public.collection_record_daily_rollups (payment_date, created_by_login, collection_staff_nickname, total_records, total_amount, updated_at)
      SELECT payment_date, created_by_login, collection_staff_nickname, COUNT(*)::integer, SUM(amount)::numeric(14,2), now()
      FROM public.collection_records WHERE ${scope} GROUP BY payment_date, created_by_login, collection_staff_nickname
      ON CONFLICT (payment_date, created_by_login, collection_staff_nickname) DO UPDATE SET
        total_records = EXCLUDED.total_records, total_amount = EXCLUDED.total_amount, updated_at = now()
    `);
    for (const month of months) await refreshCollectionRecordMonthlyRollupSlice(executor, month);
  }
  return {
    ok: true as const, action: "bounded-repair", ...input, sliceCount,
    affectedMonths: months.map((month) => month.paymentDate!.slice(0, 7)),
    before, after: input.dryRun ? before : await readCounts(),
  };
}
