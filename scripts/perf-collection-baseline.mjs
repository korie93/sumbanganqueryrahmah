import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

function readInt(name, fallback) {
  const value = Number.parseInt(String(process.env[name] ?? fallback), 10);
  return Number.isFinite(value) ? value : fallback;
}

function toMonthRange(year, month) {
  const safeYear = Number.isInteger(year) ? year : new Date().getUTCFullYear();
  const safeMonth = Number.isInteger(month) ? month : new Date().getUTCMonth() + 1;
  const monthText = String(safeMonth).padStart(2, "0");
  const startDate = `${safeYear}-${monthText}-01`;
  const endDay = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate();
  const endDate = `${safeYear}-${monthText}-${String(endDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

function toTimestampLabel(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function summarizePlan(plan) {
  const root = plan?.Plan || {};
  return {
    planningTimeMs: Number(plan?.["Planning Time"] || 0),
    executionTimeMs: Number(plan?.["Execution Time"] || 0),
    topNode: String(root["Node Type"] || "unknown"),
    totalCost: Number(root["Total Cost"] || 0),
    actualRows: Number(root["Actual Rows"] || 0),
    sharedHitBlocks: Number(root["Shared Hit Blocks"] || 0),
    sharedReadBlocks: Number(root["Shared Read Blocks"] || 0),
  };
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, "\\|");
}

const now = new Date();
const year = readInt("PERF_COLLECTION_YEAR", now.getUTCFullYear());
const month = readInt("PERF_COLLECTION_MONTH", now.getUTCMonth() + 1);
const nickname = String(
  process.env.PERF_COLLECTION_NICKNAME || process.env.SMOKE_TEST_USERNAME || "Collector Alpha",
).trim();
const username = String(
  process.env.PERF_COLLECTION_USERNAME || process.env.TEST_USERNAME || process.env.SMOKE_TEST_USERNAME || "collector.alpha",
).trim();
const { startDate, endDate } = toMonthRange(year, month);
const yearStartDate = `${year}-01-01`;
const yearEndDate = `${year}-12-31`;
const limit = Math.max(1, Math.min(500, readInt("PERF_COLLECTION_LIMIT", 200)));
const offset = Math.max(0, readInt("PERF_COLLECTION_OFFSET", 0));

const connectionString = String(process.env.DATABASE_URL || "").trim();
const pool = new pg.Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PG_HOST ?? "localhost",
        port: readInt("PG_PORT", 5432),
        user: process.env.PG_USER ?? "postgres",
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE ?? "sqr_db",
      },
);

const queries = [
  {
    name: "daily_list_by_nickname",
    sql: `
      SELECT
        id,
        payment_date,
        amount,
        collection_staff_nickname,
        created_at
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
        AND lower(collection_staff_nickname) = lower($3)
      ORDER BY payment_date ASC, created_at ASC, id ASC
      LIMIT $4
      OFFSET $5
    `,
    values: [startDate, endDate, nickname, limit, offset],
  },
  {
    name: "daily_summary_by_nickname",
    sql: `
      SELECT
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
        AND lower(collection_staff_nickname) = lower($3)
    `,
    values: [startDate, endDate, nickname],
  },
  {
    name: "daily_grouped_amounts_by_date",
    sql: `
      SELECT
        payment_date,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
        AND lower(collection_staff_nickname) = lower($3)
      GROUP BY payment_date
      ORDER BY payment_date ASC
    `,
    values: [startDate, endDate, nickname],
  },
  {
    name: "daily_grouped_amounts_by_nickname_and_date",
    sql: `
      SELECT
        lower(collection_staff_nickname) AS nickname_key,
        payment_date,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
        AND lower(collection_staff_nickname) = ANY($3::text[])
      GROUP BY lower(collection_staff_nickname), payment_date
      ORDER BY lower(collection_staff_nickname) ASC, payment_date ASC
    `,
    values: [startDate, endDate, [nickname.toLowerCase()]],
  },
  {
    name: "target_lookup_for_month",
    sql: `
      SELECT
        id,
        username,
        year,
        month,
        monthly_target
      FROM public.collection_daily_targets
      WHERE year = $1
        AND month = $2
        AND lower(username) = lower($3)
      LIMIT 1
    `,
    values: [year, month, nickname],
  },
  {
    name: "daily_paid_customers_by_creator_day",
    sql: `
      SELECT
        id,
        customer_name,
        account_number,
        amount,
        collection_staff_nickname
      FROM public.collection_records
      WHERE lower(created_by_login) = lower($1)
        AND payment_date = $2::date
      ORDER BY created_at ASC, id ASC
    `,
    values: [username, startDate],
  },
  {
    name: "record_list_by_creator_month",
    sql: `
      SELECT
        id,
        payment_date,
        amount,
        created_by_login,
        created_at
      FROM public.collection_records
      WHERE created_by_login = $1
        AND payment_date BETWEEN $2::date AND $3::date
      ORDER BY payment_date ASC, created_at ASC, id ASC
      LIMIT $4
      OFFSET $5
    `,
    values: [username, startDate, endDate, limit, offset],
  },
  {
    name: "monthly_summary_by_year",
    sql: `
      SELECT
        EXTRACT(MONTH FROM payment_date)::int AS month,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
        AND ($3::text = '' OR lower(collection_staff_nickname) = lower($3))
      GROUP BY 1
      ORDER BY 1
      LIMIT 12
    `,
    values: [yearStartDate, yearEndDate, nickname],
  },
  {
    name: "nickname_summary_by_range",
    sql: `
      SELECT
        collection_staff_nickname AS nickname,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date BETWEEN $1::date AND $2::date
      GROUP BY collection_staff_nickname
      ORDER BY lower(collection_staff_nickname) ASC
    `,
    values: [startDate, endDate],
  },
];

async function runExplain(query) {
  const result = await pool.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
    query.values,
  );
  const plan = result.rows?.[0]?.["QUERY PLAN"]?.[0];
  return {
    name: query.name,
    plan,
    summary: summarizePlan(plan),
  };
}

async function run() {
  const startedAt = new Date().toISOString();
  const explainResults = [];

  for (const query of queries) {
    explainResults.push(await runExplain(query));
  }

  const outputDir = path.resolve("var", "perf");
  await fs.mkdir(outputDir, { recursive: true });
  const fileStem = `collection-baseline-${toTimestampLabel(new Date())}`;
  const jsonPath = path.join(outputDir, `${fileStem}.json`);
  const markdownPath = path.join(outputDir, `${fileStem}.md`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        startedAt,
        inputs: {
          year,
          month,
        nickname,
        username,
        from: startDate,
        to: endDate,
        limit,
          offset,
        },
        explainResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  const markdownLines = [
    "# Collection Report Performance Baseline",
    "",
    `Generated at: ${startedAt}`,
    "",
    "## Inputs",
    "",
    `- Year: ${year}`,
    `- Month: ${month}`,
    `- Nickname: ${nickname}`,
    `- Username: ${username}`,
    `- Date range: ${startDate} to ${endDate}`,
    `- Year summary range: ${yearStartDate} to ${yearEndDate}`,
    `- Limit/Offset: ${limit}/${offset}`,
    "",
    "## Query Summary",
    "",
    "| Query | Planning (ms) | Execution (ms) | Top Node | Total Cost | Actual Rows | Shared Hit | Shared Read |",
    "|---|---:|---:|---|---:|---:|---:|---:|",
    ...explainResults.map(({ name, summary }) =>
      `| ${markdownEscape(name)} | ${summary.planningTimeMs.toFixed(2)} | ${summary.executionTimeMs.toFixed(2)} | ${markdownEscape(summary.topNode)} | ${summary.totalCost.toFixed(2)} | ${summary.actualRows} | ${summary.sharedHitBlocks} | ${summary.sharedReadBlocks} |`),
    "",
    `Raw JSON plan: ${jsonPath}`,
  ];

  await fs.writeFile(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");

  console.log(`Performance baseline complete.`);
  console.log(`Markdown report: ${markdownPath}`);
  console.log(`JSON report: ${jsonPath}`);
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
