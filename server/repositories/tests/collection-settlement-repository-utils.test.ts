import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCollectionSettlementSequence,
  recalculateCollectionSettlementCycles,
} from "../collection-settlement-repository-utils";
import type { CollectionRepositoryExecutor } from "../collection-nickname-utils";

const TOTAL_DUE_CENTS = 100_00;

function collectSqlText(query: unknown): string {
  if (query && typeof query === "object" && "queryChunks" in query) {
    const chunks = (query as { queryChunks?: unknown[] }).queryChunks || [];
    return chunks.map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        return String((chunk as { value?: unknown }).value ?? "");
      }
      return String(chunk ?? "");
    }).join("");
  }
  return String(query ?? "");
}

test("settlement marks only the first threshold-crossing event as abort_cp", () => {
  const result = classifyCollectionSettlementSequence([
    {
      id: "00000000-0000-4000-8000-000000000003",
      paymentDate: "2026-09-03",
      createdAt: "2026-09-03T08:00:00.000Z",
      amountCents: 20_00,
      totalDueCents: TOTAL_DUE_CENTS,
    },
    {
      id: "00000000-0000-4000-8000-000000000001",
      paymentDate: "2026-09-01",
      createdAt: "2026-09-01T08:00:00.000Z",
      amountCents: 60_00,
      totalDueCents: TOTAL_DUE_CENTS,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      paymentDate: "2026-09-02",
      createdAt: "2026-09-02T08:00:00.000Z",
      amountCents: 40_00,
      totalDueCents: TOTAL_DUE_CENTS,
    },
  ]);

  assert.deepEqual(result, [
    {
      id: "00000000-0000-4000-8000-000000000003",
      classification: "cp",
      cumulativeCollectedCents: 120_00,
      remainingAmountCents: 0,
    },
    {
      id: "00000000-0000-4000-8000-000000000001",
      classification: "cp",
      cumulativeCollectedCents: 60_00,
      remainingAmountCents: 40_00,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      classification: "abort_cp",
      cumulativeCollectedCents: 100_00,
      remainingAmountCents: 0,
    },
  ]);
  assert.equal(result.filter((row) => row.classification === "abort_cp").length, 1);
});

test("settlement removes Abort CP after reversing the crossing payment", () => {
  const inputs = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      paymentDate: "2026-08-13",
      createdAt: "2026-08-13T08:00:00.000Z",
      amountCents: 300_00,
      totalDueCents: 1000_00,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      paymentDate: "2026-08-14",
      createdAt: "2026-08-14T08:00:00.000Z",
      amountCents: 200_00,
      totalDueCents: 1000_00,
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      paymentDate: "2026-08-20",
      createdAt: "2026-08-20T08:00:00.000Z",
      amountCents: 500_00,
      totalDueCents: 1000_00,
    },
    {
      id: "00000000-0000-4000-8000-000000000004",
      paymentDate: "2026-08-22",
      createdAt: "2026-08-22T08:00:00.000Z",
      amountCents: 100_00,
      totalDueCents: 1000_00,
    },
  ];

  assert.deepEqual(
    classifyCollectionSettlementSequence(inputs).map((row) => row.classification),
    ["cp", "cp", "abort_cp", "cp"],
  );
  const afterReversal = classifyCollectionSettlementSequence(
    inputs.filter((input) => !input.id.endsWith("3")),
  );
  assert.deepEqual(afterReversal.map((row) => row.classification), ["cp", "cp", "cp"]);
  assert.equal(afterReversal[afterReversal.length - 1]?.cumulativeCollectedCents, 600_00);
});

test("settlement excludes a duplicate receipt row and deterministically reassigns crossing", () => {
  const common = {
    paymentDate: "2026-09-01",
    createdAt: "2026-09-01T08:00:00.000Z",
    totalDueCents: TOTAL_DUE_CENTS,
  };
  const result = classifyCollectionSettlementSequence([
    {
      ...common,
      id: "00000000-0000-4000-8000-000000000001",
      amountCents: 60_00,
      eligible: false,
    },
    {
      ...common,
      id: "00000000-0000-4000-8000-000000000002",
      amountCents: 70_00,
    },
    {
      ...common,
      id: "00000000-0000-4000-8000-000000000003",
      amountCents: 30_00,
    },
  ]);

  assert.deepEqual(result.map((row) => row.classification), [null, "cp", "abort_cp"]);
  assert.deepEqual(result.map((row) => row.cumulativeCollectedCents), [null, 70_00, 100_00]);
});

test("settlement fails closed when a cycle has inconsistent TOTAL DUE", () => {
  assert.throws(
    () => classifyCollectionSettlementSequence([
      {
        id: "00000000-0000-4000-8000-000000000001",
        paymentDate: "2026-09-01",
        createdAt: "2026-09-01T08:00:00.000Z",
        amountCents: 50_00,
        totalDueCents: 100_00,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        paymentDate: "2026-09-02",
        createdAt: "2026-09-02T08:00:00.000Z",
        amountCents: 50_00,
        totalDueCents: 120_00,
      },
    ]),
    /inconsistent TOTAL DUE/i,
  );
});

test("repository recalculation locks the cycle and persists deterministic window results", async () => {
  const statements: string[] = [];
  const executor = {
    execute: async (query: unknown) => {
      const statement = collectSqlText(query);
      statements.push(statement);
      if (/minimum_total_due/i.test(statement)) {
        return { rows: [{ minimum_total_due: "100.00", maximum_total_due: "100.00" }] };
      }
      if (/SET\s+classification\s*=\s*NULL/i.test(statement)) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000001",
            classification: null,
            cumulative_collected: null,
            remaining_amount: null,
          }],
        };
      }
      if (/WITH\s+ordered\s+AS/i.test(statement)) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000001",
            classification: "abort_cp",
            cumulative_collected: "100.00",
            remaining_amount: "0.00",
          }],
        };
      }
      return { rows: [] };
    },
  } as CollectionRepositoryExecutor;

  const states = await recalculateCollectionSettlementCycles(executor, ["cycle-dummy-1"]);

  assert.deepEqual(states.get("00000000-0000-4000-8000-000000000001"), {
    recordId: "00000000-0000-4000-8000-000000000001",
    classification: "abort_cp",
    cumulativeCollected: "100.00",
    remainingAmount: "0.00",
  });
  assert.ok(statements.some((statement) => /pg_advisory_xact_lock/i.test(statement)));
  assert.ok(statements.some((statement) => (
    /ORDER BY payment_date ASC, created_at ASC, id ASC/i.test(statement)
    && /FOR UPDATE/i.test(statement)
  )));
  assert.ok(statements.some((statement) => (
    /ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/i.test(statement)
    && /previous_cumulative_collected < ordered\.total_due/i.test(statement)
  )));
});
