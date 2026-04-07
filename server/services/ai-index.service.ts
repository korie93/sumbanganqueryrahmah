import type { PostgresStorage } from "../storage-postgres";

type AiIndexServiceOptions = {
  storage: PostgresStorage;
  ollamaEmbed: (text: string) => Promise<number[]>;
};

type AiIndexResult = {
  statusCode: number;
  body: {
    message?: string;
    success?: boolean;
    processed?: number;
    total?: number;
    inserted?: number;
    skipped?: number;
    usedKeys?: {
      nameKey: string;
      latKey: string;
      lngKey: string;
    };
  };
};

export class AiIndexService {
  constructor(private readonly options: AiIndexServiceOptions) {}

  async indexImport(params: {
    importId: string;
    username: string;
    batchSize: number;
    maxRows: number | null;
  }): Promise<AiIndexResult> {
    const importRecord = await this.options.storage.getImportById(params.importId);
    if (!importRecord) {
      return {
        statusCode: 404,
        body: { message: "Import not found" },
      };
    }

    const totalRows = await this.options.storage.getDataRowCountByImport(params.importId);
    const targetTotal = params.maxRows ? Math.min(params.maxRows, totalRows) : totalRows;

    let processed = 0;
    let offset = 0;

    while (processed < targetTotal) {
      const rows = await this.options.storage.getDataRowsForEmbedding(
        params.importId,
        params.batchSize,
        offset,
      );
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        if (processed >= targetTotal) {
          break;
        }

        const data = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
          ? row.jsonDataJsonb as Record<string, unknown>
          : {};
        const content = this.buildEmbeddingText(data);
        if (!content) {
          processed += 1;
          continue;
        }

        const embedding = await this.options.ollamaEmbed(content);
        if (embedding.length === 0) {
          processed += 1;
          continue;
        }

        await this.options.storage.saveEmbedding({
          importId: params.importId,
          rowId: row.id,
          content,
          embedding,
        });
        processed += 1;
      }

      offset += rows.length;
    }

    await this.options.storage.createAuditLog({
      action: "AI_INDEX_IMPORT",
      performedBy: params.username,
      targetResource: importRecord.name,
      details: `Indexed ${processed}/${targetTotal} rows`,
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        processed,
        total: targetTotal,
      },
    };
  }

  async importBranches(params: {
    importId: string;
    username: string;
    nameKey?: string | null;
    latKey?: string | null;
    lngKey?: string | null;
  }): Promise<AiIndexResult> {
    const importRecord = await this.options.storage.getImportById(params.importId);
    if (!importRecord) {
      return {
        statusCode: 404,
        body: { message: "Import not found" },
      };
    }

    const result = await this.options.storage.importBranchesFromRows({
      importId: params.importId,
      nameKey: params.nameKey || null,
      latKey: params.latKey || null,
      lngKey: params.lngKey || null,
    });

    await this.options.storage.createAuditLog({
      action: "IMPORT_BRANCHES",
      performedBy: params.username,
      targetResource: importRecord.name,
      details: JSON.stringify({
        inserted: result.inserted,
        skipped: result.skipped,
        usedKeys: result.usedKeys,
      }),
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        inserted: result.inserted,
        skipped: result.skipped,
        usedKeys: result.usedKeys,
      },
    };
  }

  private buildEmbeddingText(data: Record<string, unknown>): string {
    const preferredKeys = [
      "nama",
      "name",
      "full name",
      "alamat",
      "address",
      "bandar",
      "negeri",
      "employer",
      "majikan",
      "company",
      "occupation",
      "job",
      "department",
      "product",
      "model",
      "brand",
      "account",
      "akaun",
    ];

    const entries = Object.entries(data || {});
    const picked: string[] = [];

    for (const [key, value] of entries) {
      const lower = key.toLowerCase();
      if (!preferredKeys.some((term) => lower.includes(term))) {
        continue;
      }

      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue || /^\d+$/.test(normalizedValue)) {
        continue;
      }

      picked.push(`${key}: ${normalizedValue}`);
      if (picked.length >= 20) {
        break;
      }
    }

    if (picked.length === 0) {
      for (const [key, value] of entries) {
        const normalizedValue = String(value ?? "").trim();
        if (!normalizedValue || /^\d+$/.test(normalizedValue)) {
          continue;
        }

        picked.push(`${key}: ${normalizedValue}`);
        if (picked.length >= 15) {
          break;
        }
      }
    }

    const text = picked.join("\n");
    return text.length > 2000 ? text.slice(0, 2000) : text;
  }
}
