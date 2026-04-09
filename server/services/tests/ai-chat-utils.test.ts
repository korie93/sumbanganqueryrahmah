import assert from "node:assert/strict";
import test from "node:test";
import {
  type AiChatRetrievalRow,
  buildAiChatContextBlock,
  buildAiChatQuickReply,
  buildAiChatSearchTerms,
  fetchAiChatRetrievalRows,
} from "../ai-chat-utils";

type AiChatSearchStorage = Parameters<typeof fetchAiChatRetrievalRows>[0];

function createRow(
  id: string,
  jsonDataJsonb: Record<string, unknown>,
  overrides?: {
    importId?: string;
    importFilename?: string | null;
    importName?: string | null;
    rowId?: string | null;
  },
): AiChatRetrievalRow {
  const rowId = overrides?.rowId;

  return {
    id,
    importId: overrides?.importId ?? "import-1",
    importFilename: overrides?.importFilename ?? null,
    importName: overrides?.importName ?? null,
    jsonDataJsonb,
    ...(rowId === undefined ? {} : { rowId }),
  };
}

test("buildAiChatSearchTerms keeps strong unique tokens and falls back for short messages", () => {
  assert.deepEqual(
    buildAiChatSearchTerms("akaun 123456789012 jalan akaun"),
    ["123456789012", "akaun", "jalan"],
  );
  assert.deepEqual(buildAiChatSearchTerms("hi"), ["hi"]);
});

test("fetchAiChatRetrievalRows dedupes rows and prioritizes stronger digit matches", async () => {
  const rowExact = createRow("row-1", {
    Nama: "Ali",
    "No. MyKad": "123456789012",
  });
  const rowPartial = createRow("row-2", {
    Nama: "Ali Jalan",
    "Account No": "XX123456789012YY",
  });
  const rowText = createRow("row-3", {
    Nama: "Jalan Ampang",
  });

  const storage: AiChatSearchStorage = {
    searchGlobalDataRows: async ({ search }: { search: string }) => {
      if (search === "123456789012") {
        return { rows: [rowExact, rowPartial], total: 2 };
      }
      return { rows: [rowPartial, rowText], total: 2 };
    },
  };

  const rows = await fetchAiChatRetrievalRows(storage, ["123456789012", "jalan"]);

  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, "row-1");
  assert.equal(rows[1].id, "row-2");
  assert.equal(rows[2].id, "row-3");
});

test("buildAiChatContextBlock renders record context and empty states", () => {
  const rows: AiChatRetrievalRow[] = [
    createRow(
      "row-1",
      {
        Nama: "Ali Bin Abu",
        Alamat: "Jalan Merdeka",
      },
      {
        importFilename: "customers.xlsx",
      },
    ),
  ];

  const context = buildAiChatContextBlock(["ali", "jalan"], rows);
  assert.ok(context.includes("HASIL CARIAN KATA KUNCI: ali, jalan"));
  assert.ok(context.includes("Source: customers.xlsx"));
  assert.ok(context.includes("Nama: Ali Bin Abu"));

  assert.equal(
    buildAiChatContextBlock(["ali"], []),
    "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.",
  );
});

test("buildAiChatQuickReply prefers priority keys and falls back to generic fields", () => {
  const prioritized = buildAiChatQuickReply([
    createRow(
      "row-1",
      {
        Nama: "Ali Bin Abu",
        "No. MyKad": "900101015555",
        Alamat: "Jalan Merdeka",
      },
      {
        importName: "customer-import",
      },
    ),
  ]);

  assert.ok(prioritized.includes("Rekod dijumpai:"));
  assert.ok(prioritized.includes("Nama: Ali Bin Abu"));
  assert.ok(prioritized.includes("No. MyKad: 900101015555"));

  const fallback = buildAiChatQuickReply([
    createRow("row-2", {
      Kategori: "Pelanggan",
      Status: "Aktif",
    }),
  ]);

  assert.ok(fallback.includes("Kategori: Pelanggan"));
  assert.ok(fallback.includes("Status: Aktif"));
  assert.equal(
    buildAiChatQuickReply([]),
    "Tiada data dijumpai untuk kata kunci tersebut.",
  );
});
