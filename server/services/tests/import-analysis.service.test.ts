import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow } from "../../../shared/schema-postgres";
import {
  ImportsRepository,
  type ImportWithRowCount,
} from "../../repositories/imports.repository";
import { ImportAnalysisService } from "../import-analysis.service";

function buildRow(id: string, importId: string, jsonDataJsonb: Record<string, unknown>): DataRow {
  return {
    id,
    importId,
    jsonDataJsonb,
  };
}

test("ImportAnalysisService.analyzeAll batches rows across imports with the shared multi-import page query", async () => {
  const importsWithCounts: ImportWithRowCount[] = [
    {
      id: "import-1",
      name: "Import One",
      filename: "one.xlsx",
      createdAt: new Date("2026-04-20T00:00:00.000Z"),
      createdBy: "operator",
      isDeleted: false,
      rowCount: 2,
    },
    {
      id: "import-2",
      name: "Import Two",
      filename: "two.xlsx",
      createdAt: new Date("2026-04-20T00:05:00.000Z"),
      createdBy: "operator",
      isDeleted: false,
      rowCount: 1,
    },
  ];
  const rows = [
    buildRow("row-1", "import-1", { ic: "880101105531" }),
    buildRow("row-2", "import-1", { passport: "A1234567" }),
    buildRow("row-3", "import-2", { police: "SW12345" }),
  ];
  const calls: Array<{ importIds: string[]; limit: number; offset: number }> = [];

  class FakeImportsRepository extends ImportsRepository {
    override async getDataRowCountByImport() {
      return 0;
    }

    override async getDataRowsByImportPage() {
      return [];
    }

    override async getDataRowsByImportIdsPage(importIds: string[], limit: number, offset: number) {
      calls.push({ importIds: [...importIds], limit, offset });
      return rows.slice(offset, offset + limit);
    }
  }

  const service = new ImportAnalysisService(new FakeImportsRepository());
  const result = await service.analyzeAll(importsWithCounts);

  assert.equal(result.totalImports, 2);
  assert.equal(result.totalRows, 3);
  assert.deepEqual(result.imports.map((item) => item.id), ["import-1", "import-2"]);
  assert.equal(result.analysis.icLelaki.count, 1);
  assert.equal(result.analysis.passportMY.count, 1);
  assert.equal(result.analysis.noPolis.count, 1);
  assert.deepEqual(calls, [
    {
      importIds: ["import-1", "import-2"],
      limit: 500,
      offset: 0,
    },
  ]);
});
