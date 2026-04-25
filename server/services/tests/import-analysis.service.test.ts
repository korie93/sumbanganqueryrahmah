import assert from "node:assert/strict";
import test from "node:test";
import { ImportAnalysisService } from "../import-analysis.service";

test("import analysis stops between batches when the request signal is aborted", async () => {
  const controller = new AbortController();
  let pageCalls = 0;
  const service = new ImportAnalysisService({
    getDataRowCountByImport: async () => 2,
    getDataRowsByImportPageAfterId: async () => {
      pageCalls += 1;
      controller.abort();
      return [{
        id: "row-1",
        importId: "import-1",
        jsonDataJsonb: { name: "Alice" },
      }];
    },
  } as never);

  await assert.rejects(
    () => service.analyzeImport({
      id: "import-1",
      name: "Dataset",
      filename: "dataset.csv",
    }, controller.signal),
    { name: "AbortError" },
  );

  assert.equal(pageCalls, 1);
});

test("all-import analysis uses keyset pagination instead of offset pagination", async () => {
  const afterRowIds: Array<string | null> = [];
  const service = new ImportAnalysisService({
    getDataRowsByImportPageAfterId: async (_importId: string, _limit: number, afterRowId: string | null) => {
      afterRowIds.push(afterRowId);
      if (afterRowId === null) {
        return [{
          id: "row-1",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
        }];
      }
      if (afterRowId === "row-1") {
        return [{
          id: "row-2",
          importId: "import-1",
          jsonDataJsonb: { name: "Alice" },
        }];
      }
      return [];
    },
  } as never);

  const result = await service.analyzeAll([{
    id: "import-1",
    name: "Dataset",
    filename: "dataset.csv",
    createdAt: new Date(),
    isDeleted: false,
    createdBy: "admin.user",
    rowCount: 2,
  }]);

  assert.deepEqual(afterRowIds, [null, "row-1"]);
  assert.equal(result.totalRows, 2);
  assert.equal(result.analysis.duplicates.count, 1);
  assert.deepEqual(result.analysis.duplicates.items[0], { value: "ALICE", count: 2 });
});
