import { readInteger } from "../http/validation";
import type { AiIndexService } from "./ai-index.service";

type RuntimeSettings = {
  aiEnabled: boolean;
};

type AiIndexOperationsDeps = {
  getRuntimeSettingsCached: () => Promise<RuntimeSettings>;
  aiIndexService: Pick<AiIndexService, "importBranches" | "indexImport">;
};

export class AiIndexOperationsService {
  constructor(private readonly deps: AiIndexOperationsDeps) {}

  async indexImport(params: {
    importId: string;
    username: string;
    batchSize?: unknown;
    maxRows?: unknown;
  }) {
    const runtimeSettings = await this.deps.getRuntimeSettingsCached();
    if (!runtimeSettings.aiEnabled) {
      return {
        statusCode: 503,
        body: { message: "AI assistant is disabled by system settings." },
      };
    }

    const batchSize = Math.max(1, Math.min(20, readInteger(params.batchSize, 5)));
    const maxRowsValue = readInteger(params.maxRows, 0);
    const maxRows = maxRowsValue > 0 ? Math.max(1, maxRowsValue) : null;

    return this.deps.aiIndexService.indexImport({
      importId: params.importId,
      username: params.username,
      batchSize,
      maxRows,
    });
  }

  async importBranches(params: {
    importId: string;
    username: string;
    nameKey?: unknown;
    latKey?: unknown;
    lngKey?: unknown;
  }) {
    return this.deps.aiIndexService.importBranches({
      importId: params.importId,
      username: params.username,
      nameKey: typeof params.nameKey === "string" ? params.nameKey : null,
      latKey: typeof params.latKey === "string" ? params.latKey : null,
      lngKey: typeof params.lngKey === "string" ? params.lngKey : null,
    });
  }
}
