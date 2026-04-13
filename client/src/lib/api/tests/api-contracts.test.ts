import assert from "node:assert/strict";
import test from "node:test";
import {
  getImportData,
  getImports,
  deleteImport,
  renameImport,
} from "@/lib/api/imports";
import { getAuditLogs } from "@/lib/api/audit";
import { advancedSearchData, getSearchColumns, searchData } from "@/lib/api/search";
import {
  getSettings,
  getTabVisibility,
  updateSetting,
} from "@/lib/api/settings";

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("imports API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);

    if (url.startsWith("/api/imports/import-123/data")) {
      return jsonResponse({
        rows: [
          {
            id: "row-1",
            importId: "import-123",
            jsonDataJsonb: { name: "Alice" },
          },
        ],
        headers: ["name", "email"],
        total: 1,
        page: 1,
        limit: 50,
        pageSize: 50,
        offset: 0,
        nextCursor: null,
        pagination: {
          mode: "hybrid",
          page: 1,
          pageSize: 50,
          limit: 50,
          offset: 0,
          total: 1,
          totalPages: 1,
          nextCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    if (url === "/api/imports") {
      return jsonResponse({
        imports: [
          {
            id: "import-123",
            name: "March Import",
            filename: "march.csv",
            createdAt: "2026-03-26T00:00:00.000Z",
            isDeleted: false,
            createdBy: "admin.user",
            rowCount: 12,
          },
        ],
        pagination: {
          mode: "cursor",
          limit: 100,
          pageSize: 100,
          nextCursor: null,
          hasMore: false,
          total: 1,
        },
      });
    }

    if (url === "/api/imports/import-123/rename") {
      return jsonResponse({
        id: "import-123",
        name: "Renamed Import",
        filename: "march.csv",
        createdAt: "2026-03-26T00:00:00.000Z",
        isDeleted: false,
        createdBy: "admin.user",
      });
    }

    if (url === "/api/imports/import-123") {
      return jsonResponse({
        ok: true,
        success: true,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const imports = await getImports();
    const importPage = await getImportData("import-123", 1, 50);
    const renamed = await renameImport("import-123", "Renamed Import");
    const deleted = await deleteImport("import-123");

    assert.equal(imports.imports[0]?.rowCount, 12);
    assert.equal(imports.pagination.mode, "cursor");
    assert.equal(importPage.rows[0]?.jsonDataJsonb?.name, "Alice");
    assert.deepEqual(importPage.headers, ["name", "email"]);
    assert.equal(importPage.pagination.mode, "hybrid");
    assert.equal(renamed.name, "Renamed Import");
    assert.equal(deleted.success, true);
  } finally {
    restoreFetch();
  }
});

test("search and audit API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url === "/api/search/global?q=alice&page=2&pageSize=25") {
      return jsonResponse({
        columns: ["name", "Source File"],
        rows: [{ name: "Alice", "Source File": "march.csv" }],
        results: [{ name: "Alice", "Source File": "march.csv" }],
        total: 40,
        page: 2,
        limit: 25,
        pageSize: 25,
        offset: 25,
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 40,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    if (url === "/api/search/advanced" && method === "POST") {
      return jsonResponse({
        results: [{ name: "Alice", "Source File": "march.csv" }],
        headers: ["name", "Source File"],
        total: 40,
        page: 2,
        limit: 25,
        pageSize: 25,
        offset: 25,
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 40,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    if (url === "/api/search/columns") {
      return jsonResponse(["name", "phone"]);
    }

    if (url === "/api/audit-logs?page=2&pageSize=25") {
      return jsonResponse({
        logs: [
          {
            id: "audit-1",
            action: "LOGIN",
            performedBy: "admin.user",
            requestId: null,
            targetUser: "alice",
            targetResource: "auth:login",
            details: "Successful login",
            timestamp: "2026-03-26T00:00:00.000Z",
          },
        ],
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 26,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const global = await searchData("alice", 2, 25);
    const advanced = await advancedSearchData(
      [{ field: "name", operator: "contains", value: "alice" }],
      "AND",
      2,
      25,
    );
    const columns = await getSearchColumns();
    const audit = await getAuditLogs({ page: 2, pageSize: 25 });

    assert.equal(global.pagination.mode, "offset");
    assert.equal(global.pagination.offset, 25);
    assert.equal(advanced.pagination.totalPages, 2);
    assert.deepEqual(columns, ["name", "phone"]);
    assert.equal(audit.pagination.mode, "offset");
    assert.equal(audit.logs[0]?.action, "LOGIN");
  } finally {
    restoreFetch();
  }
});

test("search and audit API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url.startsWith("/api/search/global?")) {
      return jsonResponse({ results: [], total: 0 });
    }

    if (url === "/api/search/advanced" && method === "POST") {
      return jsonResponse({ results: [], total: 0 });
    }

    if (url === "/api/search/columns") {
      return jsonResponse([""]);
    }

    if (url.startsWith("/api/audit-logs?")) {
      return jsonResponse({ logs: [] });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(() => searchData("alice", 1, 25), /API contract mismatch for \/api\/search\/global/);
    await assert.rejects(
      () => advancedSearchData([{ field: "name", operator: "contains", value: "alice" }], "AND", 1, 25),
      /API contract mismatch for \/api\/search\/advanced/,
    );
    await assert.rejects(() => getSearchColumns(), /API contract mismatch for \/api\/search\/columns/);
    await assert.rejects(() => getAuditLogs({ page: 1, pageSize: 25 }), /API contract mismatch for \/api\/audit-logs/);
  } finally {
    restoreFetch();
  }
});

test("imports API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);

    if (url === "/api/imports") {
      return jsonResponse({
        ok: true,
      });
    }

    if (url.startsWith("/api/imports/import-123/data")) {
      return jsonResponse({
        rows: [],
        total: 0,
      });
    }

    return jsonResponse({});
  }) as typeof fetch);

  try {
    await assert.rejects(() => getImports(), /API contract mismatch for \/api\/imports/);
    await assert.rejects(
      () => getImportData("import-123", 1, 50),
      /API contract mismatch for \/api\/imports\/import-123\/data/,
    );
  } finally {
    restoreFetch();
  }
});

test("settings API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url === "/api/settings" && method === "GET") {
      return jsonResponse({
        categories: [
          {
            id: "general",
            name: "General",
            description: null,
            settings: [
              {
                key: "system_name",
                label: "System Name",
                description: null,
                type: "text",
                value: "SQR",
                defaultValue: "SQR",
                isCritical: false,
                updatedAt: "2026-03-26T00:00:00.000Z",
                permission: {
                  canView: true,
                  canEdit: true,
                },
                options: [],
              },
            ],
          },
        ],
      });
    }

    if (url === "/api/settings" && method === "PATCH") {
      return jsonResponse({
        ok: true,
        success: true,
        status: "updated",
        message: "Updated.",
        setting: {
          key: "system_name",
          label: "System Name",
          description: null,
          type: "text",
          value: "SQR Next",
          defaultValue: "SQR",
          isCritical: false,
          updatedAt: "2026-03-26T00:00:00.000Z",
          permission: {
            canView: true,
            canEdit: true,
          },
          options: [],
        },
      });
    }

    if (url === "/api/settings/tab-visibility") {
      return jsonResponse({
        role: "admin",
        tabs: {
          settings: true,
          home: true,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const settings = await getSettings();
    const tabVisibility = await getTabVisibility();
    const updated = await updateSetting({ key: "system_name", value: "SQR Next" });

    assert.equal(settings.categories[0]?.settings[0]?.key, "system_name");
    assert.equal(tabVisibility.tabs.settings, true);
    assert.equal(updated.status, "updated");
  } finally {
    restoreFetch();
  }
});

test("updateSetting rejects malformed success payloads", async () => {
  const restoreFetch = withMockFetch((async () =>
    jsonResponse({
      success: true,
      message: "Updated.",
    })) as typeof fetch);

  try {
    await assert.rejects(
      () => updateSetting({ key: "system_name", value: "SQR Next" }),
      /API contract mismatch for \/api\/settings/,
    );
  } finally {
    restoreFetch();
  }
});
