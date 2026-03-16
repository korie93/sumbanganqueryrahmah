import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  coerceImportBranchRecord,
  detectAiBranchImportKeys,
  normalizeImportedBranchPostcode,
} from "./ai-branch-import-utils";
import {
  findBranchesByPostcodeRows,
  findBranchesByTextRows,
  getNearestBranchesRows,
  getPostcodeLatLngValue,
} from "./ai-branch-lookup-utils";
import {
  normalizeJsonPayload,
  readRows,
} from "./ai-repository-mappers";
import {
  aiDigitsSearchRows,
  aiFuzzySearchRows,
  aiKeywordSearchRows,
  aiNameSearchRows,
  saveAiEmbeddingRow,
  semanticSearchRows,
} from "./ai-search-record-utils";
import type {
  AiFuzzySearchRow,
  AiRepositoryOptions,
  AiSearchRecordRow,
  AiSemanticSearchRow,
  BranchSearchResult,
  ImportBranchSourceRow,
} from "./ai-repository-types";

export class AiRepository {
  constructor(private readonly options: AiRepositoryOptions) {}

  async createConversation(createdBy: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO public.ai_conversations (id, created_by, created_at)
      VALUES (${id}, ${createdBy}, ${new Date()})
    `);
    return id;
  }

  async saveConversationMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO public.ai_messages (id, conversation_id, role, content, created_at)
      VALUES (${crypto.randomUUID()}, ${conversationId}, ${role}, ${content}, ${new Date()})
    `);
  }

  async getConversationMessages(
    conversationId: string,
    limit = 20,
  ): Promise<Array<{ role: string; content: string }>> {
    const result = await db.execute(sql`
      SELECT role, content
      FROM public.ai_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);

    return result.rows as Array<{ role: string; content: string }>;
  }

  async saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    return saveAiEmbeddingRow(params);
  }

  async semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<AiSemanticSearchRow[]> {
    return semanticSearchRows(params);
  }

  async aiKeywordSearch(params: {
    query: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiKeywordSearchRows(params);
  }

  async aiNameSearch(params: {
    query: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiNameSearchRows(params);
  }

  async aiDigitsSearch(params: {
    digits: string;
    limit: number;
  }): Promise<AiSearchRecordRow[]> {
    return aiDigitsSearchRows(params);
  }

  async aiFuzzySearch(params: {
    query: string;
    limit: number;
  }): Promise<AiFuzzySearchRow[]> {
    return aiFuzzySearchRows(params);
  }

  async findBranchesByText(params: { query: string; limit: number }): Promise<BranchSearchResult[]> {
    return findBranchesByTextRows(params);
  }

  async findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<BranchSearchResult[]> {
    return findBranchesByPostcodeRows({
      ...params,
      ensureSpatialTables: this.options.ensureSpatialTables,
    });
  }

  async getNearestBranches(
    params: { lat: number; lng: number; limit?: number },
  ): Promise<Array<BranchSearchResult & { distanceKm: number }>> {
    return getNearestBranchesRows(params);
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    return getPostcodeLatLngValue({
      postcode,
      ensureSpatialTables: this.options.ensureSpatialTables,
    });
  }

  async importBranchesFromRows(params: {
    importId: string;
    nameKey?: string | null;
    latKey?: string | null;
  lngKey?: string | null;
  }): Promise<{ inserted: number; skipped: number; usedKeys: { nameKey: string; latKey: string; lngKey: string } }> {
    await this.options.ensureSpatialTables();

    const rows = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM public.data_rows
      WHERE import_id = ${params.importId}
    `);

    const firstRow = readRows<ImportBranchSourceRow>(rows)[0];
    const sample = coerceImportBranchRecord(firstRow?.jsonDataJsonb);
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
        skipped: readRows<ImportBranchSourceRow>(rows).length,
        usedKeys: { nameKey: nameKey || "", latKey: latKey || "", lngKey: lngKey || "" },
      };
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of readRows<ImportBranchSourceRow>(rows)) {
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

      const lat = Number(String(latVal).replace(/[^0-9.\-]/g, ""));
      const lng = Number(String(lngVal).replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
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

  async getDataRowsForEmbedding(
    importId: string,
    limit: number,
    offset: number,
  ): Promise<Array<{ id: string; jsonDataJsonb: unknown }>> {
    const result = await db.execute(sql`
      SELECT id, json_data as "jsonDataJsonb"
      FROM public.data_rows
      WHERE import_id = ${importId}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `);

    return readRows<{ id: string; jsonDataJsonb: unknown }>(result).map((row) => ({
      id: row.id,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }
}
