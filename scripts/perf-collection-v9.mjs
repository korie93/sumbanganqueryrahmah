import "dotenv/config";
import process from "node:process";
import pg from "pg";

function readInt(name, fallback) {
  const value = Number.parseInt(String(process.env[name] ?? fallback), 10);
  return Number.isFinite(value) ? value : fallback;
}

function walkPlan(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const child of Array.isArray(node.Plans) ? node.Plans : []) walkPlan(child, visitor);
}

function summarizePlan(document) {
  const root = document?.Plan ?? {};
  const indexes = new Set();
  const sequentialRelations = new Set();
  walkPlan(root, (node) => {
    if (typeof node["Index Name"] === "string") indexes.add(node["Index Name"]);
    if (node["Node Type"] === "Seq Scan" && typeof node["Relation Name"] === "string") {
      sequentialRelations.add(node["Relation Name"]);
    }
  });
  return {
    planningTimeMs: Number(document?.["Planning Time"] ?? 0),
    executionTimeMs: Number(document?.["Execution Time"] ?? 0),
    topNode: String(root["Node Type"] ?? "unknown"),
    actualRows: Number(root["Actual Rows"] ?? 0),
    sharedHitBlocks: Number(root["Shared Hit Blocks"] ?? 0),
    sharedReadBlocks: Number(root["Shared Read Blocks"] ?? 0),
    indexes: [...indexes].sort(),
    sequentialRelations: [...sequentialRelations].sort(),
  };
}

const connectionString = String(process.env.DATABASE_URL || "").trim();
const pool = new pg.Pool(connectionString
  ? { connectionString, max: 1 }
  : {
      host: process.env.PG_HOST ?? "127.0.0.1",
      port: readInt("PG_PORT", 5432),
      user: process.env.PG_USER ?? "postgres",
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE ?? "sqr_db",
      max: 1,
    });

async function explain(client, sql, values) {
  const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, values);
  return summarizePlan(result.rows?.[0]?.["QUERY PLAN"]?.[0]);
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '2s'");

    const sample = await client.query(`
      SELECT
        (SELECT source_obligation_key FROM public.collection_records WHERE source_obligation_key IS NOT NULL LIMIT 1) AS obligation_key,
        (SELECT id::text FROM public.collection_records ORDER BY created_at DESC, id DESC LIMIT 1) AS record_id,
        (SELECT id::text FROM public.collection_osp_target_revisions ORDER BY created_at DESC, id DESC LIMIT 1) AS revision_id
    `);
    const memberRows = await client.query(`
      SELECT id::text
      FROM public.collection_staff_nicknames
      WHERE is_active = true
      ORDER BY id
      LIMIT 20
    `);
    const obligationKey = sample.rows[0]?.obligation_key ?? "account:performance-plan-sentinel";
    const recordId = sample.rows[0]?.record_id ?? "00000000-0000-4000-8000-000000000000";
    const revisionId = sample.rows[0]?.revision_id ?? "00000000-0000-4000-8000-000000000000";
    const memberIds = memberRows.rows.length
      ? memberRows.rows.map((row) => row.id)
      : ["00000000-0000-4000-8000-000000000000"];

    const workloads = [
      {
        name: "general_search_active_history_page",
        sql: `
          SELECT id, payment_date, created_at
          FROM public.collection_records
          WHERE source_obligation_key = $1
          ORDER BY payment_date DESC, created_at DESC, id DESC
          LIMIT 11 OFFSET 0
        `,
        values: [obligationKey],
      },
      {
        name: "general_search_purged_history_page",
        sql: `
          SELECT original_record_id, payment_date, original_created_at
          FROM public.collection_record_purge_history
          WHERE source_obligation_key = $1
          ORDER BY payment_date DESC, original_created_at DESC, original_record_id DESC
          LIMIT 11 OFFSET 0
        `,
        values: [obligationKey],
      },
      {
        name: "manual_settlement_audit_history",
        sql: `
          SELECT id, action, timestamp
          FROM public.audit_logs
          WHERE target_resource = $1
            AND action IN (
              'COLLECTION_MANUAL_SETTLEMENT_VERIFIED',
              'COLLECTION_MANUAL_SETTLEMENT_UPDATED',
              'COLLECTION_MANUAL_SETTLEMENT_REVOKED'
            )
          ORDER BY timestamp DESC, id DESC
          LIMIT 50
        `,
        values: [recordId],
      },
      {
        name: "team_leader_collection_page",
        sql: `
          SELECT record.id, record.payment_date, record.created_at
          FROM public.collection_records record
          WHERE EXISTS (
            SELECT 1
            FROM public.collection_staff_nicknames team_member
            WHERE team_member.id = ANY($1::uuid[])
              AND team_member.is_active = true
              AND lower(team_member.nickname) = lower(record.collection_staff_nickname)
          )
          ORDER BY record.payment_date DESC, record.created_at DESC, record.id DESC
          LIMIT 100 OFFSET 0
        `,
        values: [memberIds],
      },
      {
        name: "table_a_system_payment_dataset",
        sql: `
          SELECT record.settlement_cycle_key, record.id, record.payment_date, record.amount,
            record.classification, record.collection_staff_nickname, record.created_at
          FROM public.collection_records record
          JOIN public.collection_osp_target_source_rows target_row
            ON target_row.target_revision_id = $1::uuid
            AND target_row.cycle_key = record.settlement_cycle_key
          JOIN public.collection_osp_target_sources target_source
            ON target_source.target_revision_id = target_row.target_revision_id
            AND target_source.source_import_id = record.source_import_id
          WHERE record.payment_date >= target_row.calling_date
            AND record.payment_date < target_row.calling_window_end_exclusive
            AND record.duplicate_receipt_flag = false
            AND record.source_obligation_key = target_row.canonical_obligation_key
            AND record.total_due = target_row.total_due
            AND record.billing_principal_osp = target_row.billing_principal_osp
          ORDER BY record.settlement_cycle_key, record.payment_date, record.created_at, record.id
          LIMIT 250001
        `,
        values: [revisionId],
      },
      {
        name: "table_b_latest_complete_client_snapshot",
        sql: `
          WITH latest_complete_snapshot AS (
            SELECT as_of_date, MAX(updated_at) AS snapshot_updated_at
            FROM public.collection_osp_client_results
            WHERE target_revision_id = $1::uuid
              AND aging_bucket = ANY($2::text[])
            GROUP BY as_of_date
            HAVING COUNT(DISTINCT aging_bucket) = 4
            ORDER BY snapshot_updated_at DESC, as_of_date DESC
            LIMIT 1
          )
          SELECT client.aging_bucket, client.result_percentage, client.updated_at
          FROM public.collection_osp_client_results client
          JOIN latest_complete_snapshot latest ON latest.as_of_date = client.as_of_date
          WHERE client.target_revision_id = $1::uuid
            AND client.aging_bucket = ANY($2::text[])
          ORDER BY client.aging_bucket, client.updated_at DESC, client.id DESC
        `,
        values: [revisionId, ["D3", "D4", "D5", "D6"]],
      },
    ];

    const results = [];
    for (const workload of workloads) {
      results.push({ name: workload.name, ...(await explain(client, workload.sql, workload.values)) });
    }
    const verifiedIndexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      ORDER BY indexname
    `, [[
      "idx_audit_logs_manual_settlement_target_order",
      "idx_collection_record_purge_history_obligation_order",
      "idx_collection_records_obligation_history_order",
      "idx_collection_records_lower_staff_nickname_payment_created_id",
      "idx_collection_osp_client_results_revision_date_aging_unique",
      "idx_collection_osp_target_source_rows_revision_cycle_unique",
    ]]);

    await client.query("ROLLBACK");
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      sampleAvailability: {
        activeObligation: Boolean(sample.rows[0]?.obligation_key),
        activeRecord: Boolean(sample.rows[0]?.record_id),
        savedTargetRevision: Boolean(sample.rows[0]?.revision_id),
        activeTeamMembers: memberRows.rows.length,
      },
      verifiedIndexes: verifiedIndexes.rows.map((row) => row.indexname),
      workloads: results,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
