import assert from "node:assert/strict";
import test from "node:test";
import {
  getImportData,
  getImports,
  deleteImport,
  renameImport,
} from "@/lib/api/imports";
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
        total: 1,
        page: 1,
        limit: 50,
        nextCursor: null,
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
          limit: 100,
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
    assert.equal(importPage.rows[0]?.jsonDataJsonb?.name, "Alice");
    assert.equal(renamed.name, "Renamed Import");
    assert.equal(deleted.success, true);
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
