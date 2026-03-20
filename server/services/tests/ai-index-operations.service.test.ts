import assert from "node:assert/strict";
import test from "node:test";
import type { AiIndexService } from "../ai-index.service";
import { AiIndexOperationsService } from "../ai-index-operations.service";

function createAiIndexOperationsHarness(options?: {
  aiEnabled?: boolean;
}) {
  const indexCalls: Array<Record<string, unknown>> = [];
  const branchImportCalls: Array<Record<string, unknown>> = [];

  const aiIndexService = {
    indexImport: async (params: Record<string, unknown>) => {
      indexCalls.push(params);
      return {
        statusCode: 200,
        body: {
          success: true,
          processed: 3,
          total: 3,
        },
      };
    },
    importBranches: async (params: Record<string, unknown>) => {
      branchImportCalls.push(params);
      return {
        statusCode: 200,
        body: {
          success: true,
          inserted: 4,
          skipped: 1,
        },
      };
    },
  } as unknown as AiIndexService;

  return {
    service: new AiIndexOperationsService({
      getRuntimeSettingsCached: async () => ({
        aiEnabled: options?.aiEnabled ?? true,
      }),
      aiIndexService,
    }),
    indexCalls,
    branchImportCalls,
  };
}

test("AiIndexOperationsService indexImport respects disabled AI runtime settings", async () => {
  const { service, indexCalls } = createAiIndexOperationsHarness({
    aiEnabled: false,
  });

  const result = await service.indexImport({
    importId: "import-1",
    username: "user.one",
    batchSize: 99,
    maxRows: -3,
  });

  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.body, {
    message: "AI assistant is disabled by system settings.",
  });
  assert.equal(indexCalls.length, 0);
});

test("AiIndexOperationsService indexImport clamps batch size and normalizes maxRows", async () => {
  const { service, indexCalls } = createAiIndexOperationsHarness();

  const result = await service.indexImport({
    importId: "import-1",
    username: "user.one",
    batchSize: 99,
    maxRows: -3,
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(indexCalls, [{
    importId: "import-1",
    username: "user.one",
    batchSize: 20,
    maxRows: null,
  }]);
});

test("AiIndexOperationsService importBranches normalizes optional keys", async () => {
  const { service, branchImportCalls } = createAiIndexOperationsHarness();

  const result = await service.importBranches({
    importId: "import-1",
    username: "user.one",
    nameKey: "branch_name",
    latKey: 123,
    lngKey: "longitude",
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(branchImportCalls, [{
    importId: "import-1",
    username: "user.one",
    nameKey: "branch_name",
    latKey: null,
    lngKey: "longitude",
  }]);
});
