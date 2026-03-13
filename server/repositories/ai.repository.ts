import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

type AiRepositoryOptions = {
  ensureSpatialTables: () => Promise<void>;
};

type BranchSearchResult = {
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  businessHour: string | null;
  dayOpen: string | null;
  atmCdm: string | null;
  inquiryAvailability: string | null;
  applicationAvailability: string | null;
  aeonLounge: string | null;
};

function normalizeJsonPayload(value: unknown): unknown {
  let next = value;

  if (typeof next === "string") {
    try {
      next = JSON.parse(next);
    } catch {
      return next;
    }
  }

  return next;
}

function mapBranchRow(row: any): BranchSearchResult {
  return {
    name: row.name,
    address: row.branch_address ?? null,
    phone: row.phone_number ?? null,
    fax: row.fax_number ?? null,
    businessHour: row.business_hour ?? null,
    dayOpen: row.day_open ?? null,
    atmCdm: row.atm_cdm ?? null,
    inquiryAvailability: row.inquiry_availability ?? null,
    applicationAvailability: row.application_availability ?? null,
    aeonLounge: row.aeon_lounge ?? null,
  };
}

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
    const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
    await db.execute(sql`
      INSERT INTO public.data_embeddings (id, import_id, row_id, content, embedding, created_at)
      VALUES (${crypto.randomUUID()}, ${params.importId}, ${params.rowId}, ${params.content}, ${embeddingLiteral}::vector, ${new Date()})
      ON CONFLICT (row_id) DO UPDATE SET
        import_id = EXCLUDED.import_id,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding
    `);
  }

  async semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    content: string;
    score: number;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>> {
    const embeddingLiteral = sql.raw(`'[${params.embedding.join(",")}]'`);
    const importFilter = params.importId
      ? sql`AND e.import_id = ${params.importId}`
      : sql``;

    try {
      await db.execute(sql`SET ivfflat.probes = 5`);
    } catch {
      // ignore when vector index settings are unavailable
    }

    const result = await db.execute(sql`
      SELECT
        e.row_id as "rowId",
        e.import_id as "importId",
        e.content as "content",
        (1 - (e.embedding <=> ${embeddingLiteral}::vector))::float as "score",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_embeddings e
      JOIN public.data_rows dr ON dr.id = e.row_id
      LEFT JOIN public.imports i ON i.id = e.import_id
      WHERE (i.is_deleted = false OR i.is_deleted IS NULL)
      ${importFilter}
      ORDER BY e.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${params.limit}
    `);

    return (result.rows as any[]).map((row) => ({
      ...row,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }

  async aiKeywordSearch(params: {
    query: string;
    limit: number;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>> {
    const digits = String(params.query || "").replace(/[^0-9]/g, "");
    const limit = Math.max(1, Math.min(50, params.limit || 10));
    if (digits.length < 6) return [];

    const isIc = digits.length === 12;
    const isPhone = digits.length >= 9 && digits.length <= 11;
    const icFields = ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"];
    const phoneFields = ["No. Telefon Rumah", "No. Telefon Bimbit", "Telefon", "Phone", "HP", "Handphone", "OfficePhone"];
    const accountFields = ["Nombor Akaun Bank Pemohon", "Account No", "Account Number", "No Akaun", "Card No"];

    const primaryFields = isIc ? icFields : isPhone ? phoneFields : accountFields;
    if (primaryFields.length === 0) return [];

    const perFieldMatch = sql.join(
      primaryFields.map((key) => sql`coalesce((dr.json_data::jsonb)->>${key}, '') = ${digits}`),
      sql` OR `,
    );

    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${perFieldMatch})
      ORDER BY dr.id
      LIMIT ${limit}
    `);

    return (result.rows as any[]).map((row) => ({
      ...row,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }

  async aiNameSearch(params: {
    query: string;
    limit: number;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>> {
    const q = String(params.query || "").trim();
    if (!q) return [];

    const nameKeysMatch = sql`
      (
        coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${`%${q}%`} OR
        coalesce((dr.json_data::jsonb)->>'Customer Name','') ILIKE ${`%${q}%`} OR
        coalesce((dr.json_data::jsonb)->>'name','') ILIKE ${`%${q}%`} OR
        coalesce((dr.json_data::jsonb)->>'MAKLUMAT PEMOHON','') ILIKE ${`%${q}%`}
      )
    `;

    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND ${nameKeysMatch}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);

    return (result.rows as any[]).map((row) => ({
      ...row,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }

  async aiDigitsSearch(params: {
    digits: string;
    limit: number;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>> {
    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND regexp_replace(dr.json_data::text, '[^0-9]', '', 'g') LIKE ${`%${params.digits}%`}
      ORDER BY dr.id
      LIMIT ${params.limit}
    `);

    return (result.rows as any[]).map((row) => ({
      ...row,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }

  async aiFuzzySearch(params: {
    query: string;
    limit: number;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
    score: number;
  }>> {
    const raw = String(params.query || "").toLowerCase().trim();
    const tokens = raw
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/gi, ""))
      .filter((token) => token.length >= 3);

    if (tokens.length === 0) return [];

    const scoreSql = sql.join(
      tokens.map((token) => sql`CASE WHEN dr.json_data::text ILIKE ${`%${token}%`} THEN 1 ELSE 0 END`),
      sql` + `,
    );
    const whereSql = sql.join(
      tokens.map((token) => sql`dr.json_data::text ILIKE ${`%${token}%`}`),
      sql` OR `,
    );

    const result = await db.execute(sql`
      SELECT
        dr.id as "rowId",
        dr.import_id as "importId",
        i.name as "importName",
        i.filename as "importFilename",
        dr.json_data as "jsonDataJsonb",
        (${scoreSql})::int as "score"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${whereSql})
      ORDER BY "score" DESC, dr.id
      LIMIT ${params.limit}
    `);

    return (result.rows as any[]).map((row) => ({
      ...row,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }

  async findBranchesByText(params: { query: string; limit: number }): Promise<BranchSearchResult[]> {
    const q = String(params.query || "").trim();
    if (!q) return [];

    const limit = Math.max(1, Math.min(5, params.limit));

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

      return (result.rows as any[]).map(mapBranchRow);
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

      return (result.rows as any[]).map(mapBranchRow);
    }
  }

  async findBranchesByPostcode(params: { postcode: string; limit: number }): Promise<BranchSearchResult[]> {
    await this.options.ensureSpatialTables();

    const rawDigits = String(params.postcode || "").replace(/\D/g, "");
    const postcode = rawDigits.length === 4 ? `0${rawDigits}` : rawDigits.slice(0, 5);
    if (postcode.length !== 5) return [];

    const limit = Math.max(1, Math.min(5, params.limit));

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

    if ((result.rows as any[]).length === 0) {
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

    return (result.rows as any[]).map(mapBranchRow);
  }

  async getNearestBranches(params: { lat: number; lng: number; limit?: number }): Promise<Array<BranchSearchResult & {
    distanceKm: number;
  }>> {
    const limit = Math.max(1, Math.min(5, params.limit ?? 3));
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

    return (result.rows as any[]).map((row) => ({
      ...mapBranchRow(row),
      distanceKm: Number(row.distance_km),
    }));
  }

  async getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
    await this.options.ensureSpatialTables();

    const postcodeNorm = (() => {
      const digits = String(postcode || "").replace(/\D/g, "");
      if (digits.length === 4) return `0${digits}`;
      return digits.length >= 5 ? digits.slice(0, 5) : digits;
    })();

    if (!postcodeNorm) return null;

    const lookup = async () => {
      const result = await db.execute(sql`
        SELECT lat, lng
        FROM public.aeon_branch_postcodes
        WHERE postcode = ${postcodeNorm}
        LIMIT 1
      `);

      return result.rows?.[0] as any;
    };

    let row = await lookup();
    if (row) return { lat: Number(row.lat), lng: Number(row.lng) };

    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int as "count"
      FROM public.aeon_branch_postcodes
    `);
    const count = Number((countRes.rows as any[])[0]?.count ?? 0);

    if (count === 0) {
      const branches = await db.execute(sql`
        SELECT name, branch_address, branch_lat, branch_lng
        FROM public.aeon_branches
      `);

      for (const branch of branches.rows as any[]) {
        const address = String(branch.branch_address || "");
        const match5 = address.match(/\b\d{5}\b/);
        const match4 = address.match(/\b\d{4}\b/);
        const normalized = match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
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

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const detectKeys = (sample: Record<string, any>) => {
      const keys = Object.keys(sample);
      const normalized = keys.map((key) => ({ raw: key, norm: normalizeKey(key) }));
      const findBy = (candidates: string[]) => {
        const hit = normalized.find((key) => candidates.some((candidate) => key.norm.includes(candidate)));
        return hit?.raw || null;
      };

      return {
        nameKey: findBy(["branchnames", "branchname", "cawangan", "branch", "nama"]),
        latKey: findBy(["latitude", "lat"]),
        lngKey: findBy(["longitude", "lng", "long"]),
        addressKey: findBy(["branchaddress", "address", "alamat"]),
        postcodeKey: findBy(["postcode", "poskod", "postalcode", "zip"]),
        phoneKey: findBy(["phonenumber", "phone", "telefon", "tel"]),
        faxKey: findBy(["faxnumber", "fax"]),
        businessHourKey: findBy(["businesshour", "operatinghour", "waktu", "jam"]),
        dayOpenKey: findBy(["dayopen", "day", "hari"]),
        atmKey: findBy(["atmcdm", "atm", "cdm"]),
        inquiryKey: findBy(["inquiryavailability", "inquiry"]),
        applicationKey: findBy(["applicationavailability", "application"]),
        loungeKey: findBy(["aeonlounge", "lounge"]),
        stateKey: findBy(["state", "negeri"]),
      };
    };

    const firstRow = (rows.rows as any[])[0];
    const sample = firstRow && firstRow.jsonDataJsonb && typeof firstRow.jsonDataJsonb === "object"
      ? firstRow.jsonDataJsonb
      : {};
    const detected = detectKeys(sample);

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
        skipped: (rows.rows as any[]).length,
        usedKeys: { nameKey: nameKey || "", latKey: latKey || "", lngKey: lngKey || "" },
      };
    }

    const normalizePostcode = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      const raw = String(value);
      const fiveDigits = raw.match(/\b\d{5}\b/);
      if (fiveDigits) return fiveDigits[0];
      const fourDigits = raw.match(/\b\d{4}\b/);
      if (fourDigits) return `0${fourDigits[0]}`;
      return null;
    };

    let inserted = 0;
    let skipped = 0;

    for (const row of rows.rows as any[]) {
      const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object" ? row.jsonDataJsonb : {};
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
        postcode = normalizePostcode(postcodeVal);
      }
      if (!postcode && addressVal) {
        postcode = normalizePostcode(addressVal);
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

    return (result.rows as any[]).map((row) => ({
      id: row.id,
      jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
    }));
  }
}
