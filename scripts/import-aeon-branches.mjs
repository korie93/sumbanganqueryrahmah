import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const CSV_PATH = path.resolve(process.cwd(), "data", "aeon_branches_template.csv");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePostcode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 4) return digits.padStart(5, "0");
  if (digits.length >= 5) return digits.slice(0, 5);
  return null;
}

function deriveAtmCdm(atmCdm, cdmAvailable) {
  if (normalizeText(atmCdm)) {
    return normalizeText(atmCdm);
  }

  switch (String(cdmAvailable ?? "").trim().toLowerCase()) {
    case "ya":
    case "yes":
    case "y":
    case "1":
    case "true":
      return "ATM & CDM";
    case "tidak":
    case "no":
    case "n":
    case "0":
    case "false":
      return "Tiada CDM";
    default:
      return null;
  }
}

function toNumber(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRows(rawRows) {
  const [header, ...dataRows] = rawRows;
  const columnIndex = Object.fromEntries(header.map((name, index) => [name, index]));

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => ({
      name: normalizeText(row[columnIndex.name]),
      branch_address: normalizeText(row[columnIndex.branch_address]),
      phone_number: normalizeText(row[columnIndex.phone_number]),
      fax_number: normalizeText(row[columnIndex.fax_number]),
      business_hour: normalizeText(row[columnIndex.business_hour]),
      day_open: normalizeText(row[columnIndex.day_open]),
      atm_cdm: deriveAtmCdm(row[columnIndex.atm_cdm], row[columnIndex.cdm_available]),
      inquiry_availability: normalizeText(row[columnIndex.inquiry_availability]),
      application_availability: normalizeText(row[columnIndex.application_availability]),
      aeon_lounge: normalizeText(row[columnIndex.aeon_lounge]),
      branch_lat: toNumber(row[columnIndex.branch_lat]),
      branch_lng: toNumber(row[columnIndex.branch_lng]),
      postcode: normalizePostcode(row[columnIndex.postcode]),
      state: normalizeText(row[columnIndex.state]),
    }))
    .filter((row) => row.name && row.branch_lat !== null && row.branch_lng !== null);
}

async function ensureTables(client) {
  await client.query("SET search_path TO public");
  await client.query("CREATE EXTENSION IF NOT EXISTS postgis");
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.aeon_branches (
      id text PRIMARY KEY,
      name text NOT NULL,
      branch_address text,
      phone_number text,
      fax_number text,
      business_hour text,
      day_open text,
      atm_cdm text,
      inquiry_availability text,
      application_availability text,
      aeon_lounge text,
      branch_lat double precision NOT NULL,
      branch_lng double precision NOT NULL
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
      postcode text PRIMARY KEY,
      lat double precision NOT NULL,
      lng double precision NOT NULL,
      source_branch text,
      state text
    )
  `);
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text");
  await client.query("ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text");
  await client.query("CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng ON public.aeon_branches (branch_lat, branch_lng)");
  await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique ON public.aeon_branches (lower(name))");
  await client.query("CREATE INDEX IF NOT EXISTS idx_aeon_postcodes ON public.aeon_branch_postcodes (postcode)");
}

async function main() {
  const csvText = await fs.readFile(CSV_PATH, "utf8");
  const parsed = parseCsv(csvText);
  if (parsed.length < 2) {
    throw new Error(`CSV appears empty: ${CSV_PATH}`);
  }

  const rows = buildRows(parsed);
  if (rows.length === 0) {
    throw new Error(`No valid rows ready for import from ${CSV_PATH}`);
  }

  const pool = new Pool({
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || undefined,
    database: process.env.PG_DATABASE || "sqr_db",
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: "-c search_path=public",
  });

  const client = await pool.connect();
  let branchUpserts = 0;
  let postcodeUpserts = 0;

  try {
    await client.query("BEGIN");
    await ensureTables(client);

    for (const row of rows) {
      await client.query(
        `
          INSERT INTO public.aeon_branches (
            id,
            name,
            branch_address,
            phone_number,
            fax_number,
            business_hour,
            day_open,
            atm_cdm,
            inquiry_availability,
            application_availability,
            aeon_lounge,
            branch_lat,
            branch_lng
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT ((lower(name))) DO UPDATE SET
            branch_address = EXCLUDED.branch_address,
            phone_number = EXCLUDED.phone_number,
            fax_number = EXCLUDED.fax_number,
            business_hour = EXCLUDED.business_hour,
            day_open = EXCLUDED.day_open,
            atm_cdm = EXCLUDED.atm_cdm,
            inquiry_availability = EXCLUDED.inquiry_availability,
            application_availability = EXCLUDED.application_availability,
            aeon_lounge = EXCLUDED.aeon_lounge,
            branch_lat = EXCLUDED.branch_lat,
            branch_lng = EXCLUDED.branch_lng
        `,
        [
          randomUUID(),
          row.name,
          row.branch_address,
          row.phone_number,
          row.fax_number,
          row.business_hour,
          row.day_open,
          row.atm_cdm,
          row.inquiry_availability,
          row.application_availability,
          row.aeon_lounge,
          row.branch_lat,
          row.branch_lng,
        ],
      );
      branchUpserts += 1;

      if (row.postcode) {
        await client.query(
          `
            INSERT INTO public.aeon_branch_postcodes (
              postcode,
              lat,
              lng,
              source_branch,
              state
            )
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (postcode) DO UPDATE SET
              lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              source_branch = EXCLUDED.source_branch,
              state = EXCLUDED.state
          `,
          [row.postcode, row.branch_lat, row.branch_lng, row.name, row.state],
        );
        postcodeUpserts += 1;
      }
    }

    await client.query("COMMIT");

    const branchCountResult = await client.query("SELECT COUNT(*)::int AS total FROM public.aeon_branches");
    const postcodeCountResult = await client.query("SELECT COUNT(*)::int AS total FROM public.aeon_branch_postcodes");

    console.log(
      JSON.stringify(
        {
          importedRows: rows.length,
          branchUpserts,
          postcodeUpserts,
          aeonBranchesTotal: branchCountResult.rows[0]?.total ?? 0,
          aeonBranchPostcodesTotal: postcodeCountResult.rows[0]?.total ?? 0,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
