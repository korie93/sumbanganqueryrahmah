import { sql } from "drizzle-orm";
import {
  formatCollectionAmountMyrString,
  parseCollectionAmountToCents,
} from "../../shared/collection-amount-types";
import type { CollectionRecord } from "../storage-postgres";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";

export type CollectionSettlementClassification = "cp" | "abort_cp";

export type CollectionSettlementState = {
  recordId: string;
  classification: CollectionSettlementClassification | null;
  cumulativeCollected: string | null;
  remainingAmount: string | null;
};

export type CollectionSettlementSequenceInput = {
  id: string;
  paymentDate: string;
  createdAt: Date | string;
  amountCents: number;
  totalDueCents: number;
  eligible?: boolean;
};

export type CollectionSettlementSequenceResult = {
  id: string;
  classification: CollectionSettlementClassification | null;
  cumulativeCollectedCents: number | null;
  remainingAmountCents: number | null;
};

function normalizeSettlementKey(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDateOrderValue(value: Date | string): number {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pure reference implementation of the settlement ordering contract. Runtime
 * persistence uses the equivalent PostgreSQL window expression below.
 */
export function classifyCollectionSettlementSequence(
  inputs: CollectionSettlementSequenceInput[],
): CollectionSettlementSequenceResult[] {
  const ordered = inputs
    .map((input, index) => ({ input, index }))
    .sort((left, right) => {
      const paymentDateOrder = left.input.paymentDate.localeCompare(right.input.paymentDate);
      if (paymentDateOrder !== 0) return paymentDateOrder;
      const createdAtOrder = normalizeDateOrderValue(left.input.createdAt)
        - normalizeDateOrderValue(right.input.createdAt);
      if (createdAtOrder !== 0) return createdAtOrder;
      const idOrder = left.input.id.localeCompare(right.input.id);
      return idOrder !== 0 ? idOrder : left.index - right.index;
    });
  const eligible = ordered.filter(({ input }) => input.eligible !== false);
  const totalDueValues = new Set(eligible.map(({ input }) => input.totalDueCents));
  if (totalDueValues.size > 1) {
    throw new Error("Settlement cycle contains inconsistent TOTAL DUE values.");
  }

  const resultByIndex = new Map<number, CollectionSettlementSequenceResult>();
  let cumulativeCollectedCents = 0;
  let thresholdCrossed = false;

  for (const { input, index } of ordered) {
    if (input.eligible === false) {
      resultByIndex.set(index, {
        id: input.id,
        classification: null,
        cumulativeCollectedCents: null,
        remainingAmountCents: null,
      });
      continue;
    }
    if (
      !Number.isSafeInteger(input.amountCents)
      || input.amountCents < 0
      || !Number.isSafeInteger(input.totalDueCents)
      || input.totalDueCents <= 0
    ) {
      throw new Error("Settlement sequence contains an invalid exact-money value.");
    }

    const previousCumulativeCents = cumulativeCollectedCents;
    cumulativeCollectedCents += input.amountCents;
    if (!Number.isSafeInteger(cumulativeCollectedCents)) {
      throw new Error("Settlement sequence exceeds the supported exact-money range.");
    }
    const isCrossingEvent = !thresholdCrossed
      && previousCumulativeCents < input.totalDueCents
      && cumulativeCollectedCents >= input.totalDueCents;
    if (isCrossingEvent) thresholdCrossed = true;

    resultByIndex.set(index, {
      id: input.id,
      classification: isCrossingEvent ? "abort_cp" : "cp",
      cumulativeCollectedCents,
      remainingAmountCents: Math.max(0, input.totalDueCents - cumulativeCollectedCents),
    });
  }

  return inputs.map((input, index) => resultByIndex.get(index) ?? {
    id: input.id,
    classification: null,
    cumulativeCollectedCents: null,
    remainingAmountCents: null,
  });
}

export async function acquireCollectionRecordMutationLock(
  executor: CollectionRepositoryExecutor,
  recordId: string,
): Promise<void> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) return;
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`collection-record:${normalizedRecordId}`}, 0)
    )
  `);
}

export async function loadCollectionSettlementCycleKeyForRecord(
  executor: CollectionRepositoryExecutor,
  recordId: string,
): Promise<string | null> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) return null;
  const result = await executor.execute(sql`
    SELECT settlement_cycle_key
    FROM public.collection_records
    WHERE id = ${normalizedRecordId}::uuid
    LIMIT 1
  `);
  const row = result.rows?.[0] as { settlement_cycle_key?: unknown } | undefined;
  return normalizeSettlementKey(row?.settlement_cycle_key);
}

export async function acquireCollectionSettlementCycleLocks(
  executor: CollectionRepositoryExecutor,
  cycleKeys: Array<string | null | undefined>,
): Promise<string[]> {
  const normalizedKeys = Array.from(new Set(
    cycleKeys.map(normalizeSettlementKey).filter((value): value is string => Boolean(value)),
  )).sort();

  for (const cycleKey of normalizedKeys) {
    await executor.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`collection-settlement:${cycleKey}`}, 0)
      )
    `);
  }
  return normalizedKeys;
}

function mapSettlementStateRow(row: unknown): CollectionSettlementState | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const recordId = String(value.id ?? "").trim();
  if (!recordId) return null;
  const classification = value.classification === "cp" || value.classification === "abort_cp"
    ? value.classification
    : null;
  const cumulativeRaw = value.cumulative_collected;
  const remainingRaw = value.remaining_amount;
  return {
    recordId,
    classification,
    cumulativeCollected: classification && cumulativeRaw !== null && cumulativeRaw !== undefined
      ? formatCollectionAmountMyrString(cumulativeRaw)
      : null,
    remainingAmount: classification && remainingRaw !== null && remainingRaw !== undefined
      ? formatCollectionAmountMyrString(remainingRaw)
      : null,
  };
}

export async function recalculateCollectionSettlementCycles(
  executor: CollectionRepositoryExecutor,
  cycleKeys: Array<string | null | undefined>,
): Promise<Map<string, CollectionSettlementState>> {
  const normalizedKeys = await acquireCollectionSettlementCycleLocks(executor, cycleKeys);
  const states = new Map<string, CollectionSettlementState>();

  for (const cycleKey of normalizedKeys) {
    await executor.execute(sql`
      SELECT id
      FROM public.collection_records
      WHERE settlement_cycle_key = ${cycleKey}
      ORDER BY payment_date ASC, created_at ASC, id ASC
      FOR UPDATE
    `);

    const dueResult = await executor.execute(sql`
      SELECT
        MIN(total_due)::numeric(14,2) AS minimum_total_due,
        MAX(total_due)::numeric(14,2) AS maximum_total_due
      FROM public.collection_records
      WHERE settlement_cycle_key = ${cycleKey}
        AND source_import_id IS NOT NULL
        AND source_data_row_id IS NOT NULL
        AND source_obligation_key IS NOT NULL
        AND source_match_basis IS NOT NULL
        AND total_due IS NOT NULL
        AND total_due > 0
        AND calling_date IS NOT NULL
        AND calling_window_end_exclusive IS NOT NULL
        AND payment_date >= calling_date
        AND payment_date < calling_window_end_exclusive
        AND duplicate_receipt_flag = false
    `);
    const dueRow = dueResult.rows?.[0] as {
      minimum_total_due?: unknown;
      maximum_total_due?: unknown;
    } | undefined;
    const minimumDueCents = dueRow?.minimum_total_due === null
      || dueRow?.minimum_total_due === undefined
      ? null
      : parseCollectionAmountToCents(dueRow.minimum_total_due, { allowZero: false });
    const maximumDueCents = dueRow?.maximum_total_due === null
      || dueRow?.maximum_total_due === undefined
      ? null
      : parseCollectionAmountToCents(dueRow.maximum_total_due, { allowZero: false });
    if (
      minimumDueCents === null !== (maximumDueCents === null)
      || (minimumDueCents !== null && minimumDueCents !== maximumDueCents)
    ) {
      throw new Error("Settlement cycle contains inconsistent TOTAL DUE values.");
    }

    // Clear first so moving the sole abort marker cannot transiently violate the
    // non-deferrable partial unique index.
    const cleared = await executor.execute(sql`
      UPDATE public.collection_records
      SET
        classification = NULL,
        cumulative_collected = NULL,
        remaining_amount = NULL
      WHERE settlement_cycle_key = ${cycleKey}
      RETURNING id, classification, cumulative_collected, remaining_amount
    `);
    for (const row of cleared.rows ?? []) {
      const state = mapSettlementStateRow(row);
      if (state) states.set(state.recordId, state);
    }

    const recalculated = await executor.execute(sql`
      WITH ordered AS (
        SELECT
          record.id,
          record.total_due,
          SUM(record.amount) OVER (
            ORDER BY record.payment_date ASC, record.created_at ASC, record.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::numeric(14,2) AS cumulative_collected,
          COALESCE(
            SUM(record.amount) OVER (
              ORDER BY record.payment_date ASC, record.created_at ASC, record.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::numeric(14,2) AS previous_cumulative_collected
        FROM public.collection_records record
        WHERE record.settlement_cycle_key = ${cycleKey}
          AND record.source_import_id IS NOT NULL
          AND record.source_data_row_id IS NOT NULL
          AND record.source_obligation_key IS NOT NULL
          AND record.source_match_basis IS NOT NULL
          AND record.total_due IS NOT NULL
          AND record.total_due > 0
          AND record.calling_date IS NOT NULL
          AND record.calling_window_end_exclusive IS NOT NULL
          AND record.payment_date >= record.calling_date
          AND record.payment_date < record.calling_window_end_exclusive
          AND record.duplicate_receipt_flag = false
      )
      UPDATE public.collection_records target
      SET
        classification = CASE
          WHEN ordered.previous_cumulative_collected < ordered.total_due
            AND ordered.cumulative_collected >= ordered.total_due
            THEN 'abort_cp'
          ELSE 'cp'
        END,
        cumulative_collected = ordered.cumulative_collected,
        remaining_amount = GREATEST(
          ordered.total_due - ordered.cumulative_collected,
          0
        )::numeric(14,2)
      FROM ordered
      WHERE target.id = ordered.id
      RETURNING
        target.id,
        target.classification,
        target.cumulative_collected,
        target.remaining_amount
    `);
    for (const row of recalculated.rows ?? []) {
      const state = mapSettlementStateRow(row);
      if (state) states.set(state.recordId, state);
    }
  }

  return states;
}

export function applyCollectionSettlementState(
  record: CollectionRecord,
  state: CollectionSettlementState | undefined,
): CollectionRecord {
  if (!state) return record;
  if (
    !state.classification
    || state.cumulativeCollected === null
    || state.remainingAmount === null
  ) {
    return {
      ...record,
      cumulativeCollected: null,
      remainingAmount: null,
      totalDueCovered: null,
      cpStatus: "unverified",
    };
  }
  const remainingCents = parseCollectionAmountToCents(state.remainingAmount, { allowZero: true });
  return {
    ...record,
    cumulativeCollected: state.cumulativeCollected,
    remainingAmount: state.remainingAmount,
    totalDueCovered: remainingCents === null ? null : remainingCents === 0,
    cpStatus: state.classification,
  };
}
