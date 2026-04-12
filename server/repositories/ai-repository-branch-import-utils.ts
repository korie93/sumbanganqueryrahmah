import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  coerceImportBranchRecord,
  detectAiBranchImportKeys,
  normalizeImportedBranchPostcode,
} from "./ai-branch-import-utils";
import { readRows } from "./ai-repository-mappers";
import type {
  AiBranchImportParams,
  AiBranchImportResult,
  ImportBranchSourceRow,
} from "./ai-repository-types";

function normalizeBranchCoordinate(value: unknown): number | null {
  const normalized = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(normalized) ? normalized : null;
}

export async function importAiBranchesFromRows(
  params: AiBranchImportParams & { ensureSpatialTables: () => Promise<void> },
): Promise<AiBranchImportResult> {
  await params.ensureSpatialTables();

  const rowsResult = await db.execute(sql`
    SELECT id, json_data as "jsonDataJsonb"
    FROM public.data_rows
    WHERE import_id = ${params.importId}
  `);
  const rows = readRows<ImportBranchSourceRow>(rowsResult);

  const sample = coerceImportBranchRecord(rows[0]?.jsonDataJsonb);
  const detected = detectAiBranchImportKeys(sample);

  const nameKey = params.nameKey || detected.nameKey;
  const latKey = params.latKey || detected.latKey;
  const lngKey = params.lngKey || detected.lngKey;
  const addressKey = detected.addressKey;
  const postcodeKey = detected.postcodeKey;
  const phoneKey = detected.phoneKey;
  const faxKey = detected.faxKey;
  const businessHourKey = detected.businessHourKey;
  const dayOpenKey = detected.dayOpenKey;
  const atmKey = detected.atmKey;
  const inquiryKey = detected.inquiryKey;
  const applicationKey = detected.applicationKey;
  const loungeKey = detected.loungeKey;
  const stateKey = detected.stateKey;

  if (!nameKey || !latKey || !lngKey) {
    return {
      inserted: 0,
      skipped: rows.length,
      usedKeys: { nameKey: nameKey || "", latKey: latKey || "", lngKey: lngKey || "" },
    };
  }

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const data = coerceImportBranchRecord(row.jsonDataJsonb);
    const nameVal = data[nameKey];
    const latVal = data[latKey];
    const lngVal = data[lngKey];
    const addressVal = addressKey ? data[addressKey] : null;
    const postcodeVal = postcodeKey ? data[postcodeKey] : null;
    const phoneVal = phoneKey ? data[phoneKey] : null;
    const faxVal = faxKey ? data[faxKey] : null;
    const businessHourVal = businessHourKey ? data[businessHourKey] : null;
    const dayOpenVal = dayOpenKey ? data[dayOpenKey] : null;
    const atmVal = atmKey ? data[atmKey] : null;
    const inquiryVal = inquiryKey ? data[inquiryKey] : null;
    const applicationVal = applicationKey ? data[applicationKey] : null;
    const loungeVal = loungeKey ? data[loungeKey] : null;
    const stateVal = stateKey ? data[stateKey] : null;

    if (!nameVal || latVal === undefined || lngVal === undefined) {
      skipped += 1;
      continue;
    }

    const lat = normalizeBranchCoordinate(latVal);
    const lng = normalizeBranchCoordinate(lngVal);
    if (lat === null || lng === null) {
      skipped += 1;
      continue;
    }

    await db.execute(sql`
      INSERT INTO public.aeon_branches (
        id, name, branch_address, phone_number, fax_number, business_hour, day_open,
        atm_cdm, inquiry_availability, application_availability, aeon_lounge,
        branch_lat, branch_lng
      )
      VALUES (
        ${crypto.randomUUID()},
        ${String(nameVal)},
        ${addressVal ? String(addressVal) : null},
        ${phoneVal ? String(phoneVal) : null},
        ${faxVal ? String(faxVal) : null},
        ${businessHourVal ? String(businessHourVal) : null},
        ${dayOpenVal ? String(dayOpenVal) : null},
        ${atmVal ? String(atmVal) : null},
        ${inquiryVal ? String(inquiryVal) : null},
        ${applicationVal ? String(applicationVal) : null},
        ${loungeVal ? String(loungeVal) : null},
        ${lat},
        ${lng}
      )
      ON CONFLICT DO NOTHING
    `);

    let postcode: string | null = null;
    if (postcodeVal) {
      postcode = normalizeImportedBranchPostcode(postcodeVal);
    }
    if (!postcode && addressVal) {
      postcode = normalizeImportedBranchPostcode(addressVal);
    }

    if (postcode) {
      await db.execute(sql`
        INSERT INTO public.aeon_branch_postcodes (postcode, lat, lng, source_branch, state)
        VALUES (${postcode}, ${lat}, ${lng}, ${String(nameVal)}, ${stateVal ? String(stateVal) : null})
        ON CONFLICT (postcode) DO NOTHING
      `);
    }

    inserted += 1;
  }

  return { inserted, skipped, usedKeys: { nameKey, latKey, lngKey } };
}
