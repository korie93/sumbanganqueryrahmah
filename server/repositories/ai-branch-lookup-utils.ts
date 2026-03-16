import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { mapBranchRow, readRows } from "./ai-repository-mappers";
import type {
  BranchRowDb,
  BranchSearchResult,
  BranchSeedRow,
  CountRow,
  PostcodeLatLngRow,
} from "./ai-repository-types";

export function clampAiBranchLookupLimit(limit: number | undefined, fallback = 5): number {
  return Math.max(1, Math.min(5, limit ?? fallback));
}

export function normalizeAiBranchLookupQuery(query: string | null | undefined): string {
  return String(query || "").trim();
}

export function normalizeAiBranchLookupPostcode(postcode: string | null | undefined): string {
  const rawDigits = String(postcode || "").replace(/\D/g, "");
  return rawDigits.length === 4 ? `0${rawDigits}` : rawDigits.slice(0, 5);
}

export function extractAiBranchSeedPostcode(address: string | null | undefined): string | null {
  const raw = String(address || "");
  const match5 = raw.match(/\b\d{5}\b/);
  const match4 = raw.match(/\b\d{4}\b/);
  return match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
}

export async function findBranchesByTextRows(params: {
  query: string;
  limit: number;
}): Promise<BranchSearchResult[]> {
  const q = normalizeAiBranchLookupQuery(params.query);
  if (!q) return [];

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
        name ILIKE ${`%${q}%`}
        OR branch_address ILIKE ${`%${q}%`}
        OR GREATEST(
          similarity(coalesce(name, ''), ${q}),
          similarity(coalesce(branch_address, ''), ${q})
        ) > 0.1
      ORDER BY
        CASE
          WHEN name ILIKE ${`%${q}%`} OR branch_address ILIKE ${`%${q}%`} THEN 0
          ELSE 1
        END,
        score DESC,
        name
      LIMIT ${limit}
    `);

    return readRows<BranchRowDb>(result).map(mapBranchRow);
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
      WHERE name ILIKE ${`%${q}%`}
         OR branch_address ILIKE ${`%${q}%`}
      ORDER BY name
      LIMIT ${limit}
    `);

    return readRows<BranchRowDb>(result).map(mapBranchRow);
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
  if (row) return { lat: Number(row.lat), lng: Number(row.lng) };

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

    for (const branch of readRows<BranchSeedRow>(branches)) {
      const normalized = extractAiBranchSeedPostcode(branch.branch_address);
      if (!normalized) continue;

      await db.execute(sql`
        INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
        VALUES (${normalized}, ${Number(branch.branch_lat)}, ${Number(branch.branch_lng)}, ${String(branch.name)}, null)
        ON CONFLICT (postcode) DO NOTHING
      `);
    }

    row = await lookup();
    if (row) return { lat: Number(row.lat), lng: Number(row.lng) };
  }

  return null;
}
