import type { PostgresStorage } from "../storage-postgres";

export type AiChatRetrievalRow =
  Awaited<ReturnType<PostgresStorage["searchGlobalDataRows"]>>["rows"][number];

type AiChatSearchStorage = Pick<PostgresStorage, "searchGlobalDataRows">;

function getRowData(row: AiChatRetrievalRow): Record<string, unknown> {
  return row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
    ? row.jsonDataJsonb as Record<string, unknown>
    : {};
}

function valueMatchesTerm(value: unknown, term: string): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const termLower = term.toLowerCase();
  const termDigits = term.replace(/\D/g, "");
  const asString = String(value);
  if (termDigits.length >= 6) {
    const valueDigits = asString.replace(/\D/g, "");
    if (valueDigits.includes(termDigits)) {
      return true;
    }
  }

  return asString.toLowerCase().includes(termLower);
}

function rowMatchesTerm(row: AiChatRetrievalRow, term: string): boolean {
  return Object.values(getRowData(row)).some((value) => valueMatchesTerm(value, term));
}

function scoreRowForTerm(row: AiChatRetrievalRow, term: string): number {
  const data = getRowData(row);
  const termDigits = term.replace(/\D/g, "");
  let score = 0;

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const valueString = String(value ?? "");
    const valueDigits = valueString.replace(/\D/g, "");

    if (!termDigits) {
      if (valueString.toLowerCase().includes(term.toLowerCase())) {
        score += 2;
      }
      continue;
    }

    if (valueDigits === termDigits) {
      if (
        keyLower.includes("ic") ||
        keyLower.includes("mykad") ||
        keyLower.includes("nric") ||
        keyLower.includes("kp")
      ) {
        score += 10;
      } else {
        score += 6;
      }
    } else if (valueDigits.includes(termDigits)) {
      score += 3;
    }
  }

  return score;
}

export function buildAiChatSearchTerms(message: string): string[] {
  const raw = message.toLowerCase();
  const digitMatches = raw.match(/\d{4,}/g) || [];
  const wordMatches = raw.match(/\b[a-z0-9]{4,}\b/gi) || [];
  const combined = [...digitMatches, ...wordMatches]
    .map((term) => term.replace(/[^a-z0-9]/gi, ""))
    .filter((term) => term.length >= 4);
  const unique = Array.from(new Set(combined));
  unique.sort((left, right) => right.length - left.length);
  return unique.length > 0 ? unique.slice(0, 4) : [message];
}

export async function fetchAiChatRetrievalRows(
  storage: AiChatSearchStorage,
  searchTerms: string[],
): Promise<AiChatRetrievalRow[]> {
  const resultMap = new Map<string, AiChatRetrievalRow>();

  for (const term of searchTerms) {
    const retrieval = await storage.searchGlobalDataRows({
      search: term,
      limit: 30,
      offset: 0,
    });

    for (const row of retrieval.rows || []) {
      const rowKey = String(row.id || row.rowId || "");
      if (rowKey && !resultMap.has(rowKey)) {
        resultMap.set(rowKey, row);
      }
    }

    if (resultMap.size >= 60) {
      break;
    }
  }

  const allRows = Array.from(resultMap.values());
  const matchedRows = allRows.filter((row) =>
    searchTerms.some((term) => rowMatchesTerm(row, term)),
  );

  return (matchedRows.length > 0 ? matchedRows : allRows)
    .map((row) => ({
      row,
      score: Math.max(...searchTerms.map((term) => scoreRowForTerm(row, term))),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.row)
    .slice(0, 5);
}

export function buildAiChatContextBlock(
  searchTerms: string[],
  retrievalRows: AiChatRetrievalRow[],
): string {
  const contextRows = retrievalRows.map((row, index) => {
    const entries = Object.entries(getRowData(row)).slice(0, 20);
    const lines = entries.map(([key, value]) => `${key}: ${String(value ?? "")}`);
    const source = row.importFilename || row.importName || "Unknown";
    return `# Rekod ${index + 1} (Source: ${source}, RowId: ${row.id || row.rowId || "unknown"})\n${lines.join("\n")}`;
  });

  if (contextRows.length === 0) {
    return "DATA SISTEM: TIADA REKOD DIJUMPAI UNTUK KATA KUNCI INI.";
  }

  return `DATA SISTEM (HASIL CARIAN KATA KUNCI: ${searchTerms.join(", ")}):\n${contextRows.join("\n\n")}`;
}

export function buildAiChatQuickReply(retrievalRows: AiChatRetrievalRow[]): string {
  if (retrievalRows.length === 0) {
    return "Tiada data dijumpai untuk kata kunci tersebut.";
  }

  const priorityKeys = [
    "nama",
    "name",
    "no. mykad",
    "mykad",
    "ic",
    "no. ic",
    "nric",
    "no. kp",
    "akaun",
    "account",
    "telefon",
    "phone",
    "hp",
    "alamat",
    "address",
    "umur",
    "age",
  ];

  const summaries = retrievalRows.slice(0, 3).map((row, index) => {
    const data = getRowData(row);
    const pairs: string[] = [];

    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase();
      if (priorityKeys.some((term) => lower.includes(term))) {
        pairs.push(`${key}: ${String(data[key] ?? "")}`);
      }
      if (pairs.length >= 8) {
        break;
      }
    }

    if (pairs.length === 0) {
      pairs.push(
        ...Object.entries(data)
          .slice(0, 6)
          .map(([key, value]) => `${key}: ${String(value ?? "")}`),
      );
    }

    const source = row.importFilename || row.importName || "Unknown";
    return `Rekod ${index + 1} (Source: ${source})\n${pairs.join("\n")}`;
  });

  return `Rekod dijumpai:\n${summaries.join("\n\n")}`;
}
