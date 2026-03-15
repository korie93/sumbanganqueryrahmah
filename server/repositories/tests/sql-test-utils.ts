import type { SQLWrapper } from "drizzle-orm";

export type QueryResponse = { rows?: unknown[] };

export function collectSqlText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(collectSqlText).join("");
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  if ("queryChunks" in value && Array.isArray((value as any).queryChunks)) {
    return (value as any).queryChunks.map(collectSqlText).join("");
  }
  if ("value" in value && Array.isArray((value as any).value)) {
    return (value as any).value.map((chunk: unknown) => collectSqlText(chunk)).join("");
  }
  return "";
}

export function collectBoundValues(value: unknown, inFragment = false): unknown[] {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    value === null
  ) {
    return inFragment ? [] : [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((chunk) => collectBoundValues(chunk, inFragment));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if ("queryChunks" in value && Array.isArray((value as any).queryChunks)) {
    return (value as any).queryChunks.flatMap((chunk: unknown) => collectBoundValues(chunk, false));
  }
  if ("value" in value && Array.isArray((value as any).value)) {
    return (value as any).value.flatMap((chunk: unknown) => collectBoundValues(chunk, true));
  }
  return [];
}

export function createSequenceExecutor<TExecutor extends { execute: (query: string | SQLWrapper) => Promise<QueryResponse> }>(
  responses: QueryResponse[],
): { executor: TExecutor; queries: unknown[] } {
  const queries: unknown[] = [];
  let callIndex = 0;
  const executor = {
    execute: async (query: unknown) => {
      queries.push(query);
      return responses[callIndex++] ?? { rows: [] };
    },
  } as TExecutor;
  return { executor, queries };
}
