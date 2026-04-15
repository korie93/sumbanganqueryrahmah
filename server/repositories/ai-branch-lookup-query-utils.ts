import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { mapBranchRow, readRows } from "./ai-repository-mappers";
import { buildLikePattern } from "./sql-like-utils";
import {
  clampAiBranchLookupLimit,
  extractAiBranchSeedPostcode,
  normalizeAiBranchLookupPostcode,
  normalizeAiBranchLookupQuery,
} from "./ai-branch-lookup-normalize-utils";
import type {
  BranchRowDb,
  BranchSearchResult,
  BranchSeedRow,
  CountRow,
  PostcodeLatLngRow,
} from "./ai-repository-types";

function mapBranchRows(rows: unknown): BranchSearchResult[] {
  return readRows<BranchRowDb>({ rows: Array.isArray(rows) ? rows : [] }).map(mapBranchRow);
}

export async function findBranchesByTextRows(params: {
  query: string;
  limit: number;
}): Promise<BranchSearchResult[]> {
  const q = normalizeAiBranchLookupQuery(params.query);
  if (!q) return [];

  const likePattern = buildLikePattern(q, "contains");
  const limit = clampAiBranchLookupLimit(params.limit);

  try {
    const result = await db.execute(sql`
      SELECT
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
        GREATEST(
          similarity(coalesce(name, ''), ${q}),
          similarity(coalesce(branch_address, ''), ${q})
        ) AS score
      FROM public.aeon_branches
      WHERE
        name ILIKE ${likePattern} ESCAPE '\'
        OR branch_address ILIKE ${likePattern} ESCAPE '\'
        OR GREATEST(
          similarity(coalesce(name, ''), ${q}),
          similarity(coalesce(branch_address, ''), ${q})
        ) > 0.1
      ORDER BY
        CASE
          WHEN name ILIKE ${likePattern} ESCAPE '\'
            OR branch_address ILIKE ${likePattern} ESCAPE '\'
            THEN 0
          ELSE 1
        END,
        score DESC,
        name
      LIMIT ${limit}
    `);

    return mapBranchRows(result.rows);
  } catch {
    const result = await db.execute(sql`
      SELECT
        name,
        branch_address,
        phone_number,
        fax_number,
        business_hour,
        day_open,
        atm_cdm,
        inquiry_availability,
        application_availability,
        aeon_lounge
      FROM public.aeon_branches
      WHERE name ILIKE ${likePattern} ESCAPE '\'
         OR branch_address ILIKE ${likePattern} ESCAPE '\'
      ORDER BY name
      LIMIT ${limit}
    `);

    return mapBranchRows(result.rows);
  }
}

export async function findBranchesByPostcodeRows(params: {
  postcode: string;
  limit: number;
  ensureSpatialTables: () => Promise<void>;
}): Promise<BranchSearchResult[]> {
  await params.ensureSpatialTables();

  const postcode = normalizeAiBranchLookupPostcode(params.postcode);
  if (postcode.length !== 5) return [];

  const limit = clampAiBranchLookupLimit(params.limit);

  let result = await db.execute(sql`
    (
      SELECT DISTINCT
        b.name,
        b.branch_address,
        b.phone_number,
        b.fax_number,
        b.business_hour,
        b.day_open,
        b.atm_cdm,
        b.inquiry_availability,
        b.application_availability,
        b.aeon_lounge
      FROM public.aeon_branch_postcodes p
      JOIN public.aeon_branches b
        ON lower(b.name) = lower(p.source_branch)
      WHERE p.postcode = ${postcode}
    )
    UNION
    (
      SELECT
        b.name,
        b.branch_address,
        b.phone_number,
        b.fax_number,
        b.business_hour,
        b.day_open,
        b.atm_cdm,
        b.inquiry_availability,
        b.application_availability,
        b.aeon_lounge
      FROM public.aeon_branches b
      WHERE coalesce(b.branch_address, '') ~ ('(^|\\D)' || ${postcode} || '(\\D|$)')
    )
    ORDER BY name
    LIMIT ${limit}
  `);

  if (readRows<BranchRowDb>(result).length === 0) {
    result = await db.execute(sql`
      SELECT
        b.name,
        b.branch_address,
        b.phone_number,
        b.fax_number,
        b.business_hour,
        b.day_open,
        b.atm_cdm,
        b.inquiry_availability,
        b.application_availability,
        b.aeon_lounge
      FROM public.aeon_branch_postcodes p
      JOIN public.aeon_branches b
        ON lower(b.name) = lower(p.source_branch)
      WHERE p.postcode ~ '^[0-9]{5}$'
      ORDER BY abs((p.postcode)::int - (${postcode})::int), b.name
      LIMIT ${limit}
    `);
  }

  return readRows<BranchRowDb>(result).map(mapBranchRow);
}

export async function getNearestBranchesRows(params: {
  lat: number;
  lng: number;
  limit?: number;
}): Promise<Array<BranchSearchResult & { distanceKm: number }>> {
  const limit = clampAiBranchLookupLimit(params.limit, 3);
  const result = await db.execute(sql`
    SELECT
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
      ST_DistanceSphere(
        ST_MakePoint(${params.lng}, ${params.lat}),
        ST_MakePoint(branch_lng, branch_lat)
      ) / 1000 AS distance_km
    FROM public.aeon_branches
    ORDER BY distance_km
    LIMIT ${limit}
  `);

  return readRows<BranchRowDb>(result).map((row) => ({
    ...mapBranchRow(row),
    distanceKm: Number(row.distance_km),
  }));
}

export async function getPostcodeLatLngValue(params: {
  postcode: string;
  ensureSpatialTables: () => Promise<void>;
}): Promise<{ lat: number; lng: number } | null> {
  await params.ensureSpatialTables();

  const postcodeNorm = normalizeAiBranchLookupPostcode(params.postcode);
  if (!postcodeNorm) return null;

  const lookup = async () => {
    const result = await db.execute(sql`
      SELECT lat, lng
      FROM public.aeon_branch_postcodes
      WHERE postcode = ${postcodeNorm}
      LIMIT 1
    `);

    return readRows<PostcodeLatLngRow>(result)[0] ?? null;
  };

  let row = await lookup();
  if (row) {
    return { lat: Number(row.lat), lng: Number(row.lng) };
  }

  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int as "count"
    FROM public.aeon_branch_postcodes
  `);
  const count = Number(readRows<CountRow>(countRes)[0]?.count ?? 0);

  if (count === 0) {
    const branches = await db.execute(sql`
      SELECT name, branch_address, branch_lat, branch_lng
      FROM public.aeon_branches
    `);

    const seedValues = [];
    for (const branch of readRows<BranchSeedRow>(branches)) {
      const normalized = extractAiBranchSeedPostcode(branch.branch_address);
      if (!normalized) continue;

      seedValues.push(sql`(${normalized}, ${Number(branch.branch_lat)}, ${Number(branch.branch_lng)}, ${String(branch.name)}, null)`);
    }

    if (seedValues.length > 0) {
      await db.execute(sql`
        INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
        VALUES ${sql.join(seedValues, sql`, `)}
        ON CONFLICT (postcode) DO NOTHING
      `);
    }

    row = await lookup();
    if (row) {
      return { lat: Number(row.lat), lng: Number(row.lng) };
    }
  }

  return null;
}
