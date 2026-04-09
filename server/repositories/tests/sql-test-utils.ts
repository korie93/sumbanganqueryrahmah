import type { SQLWrapper } from "drizzle-orm";

export type QueryResponse = { rows?: unknown[] };

type QueryChunkContainer = {
  queryChunks: unknown[];
};

type ValueChunkContainer = {
  value: unknown[];
};

function hasQueryChunks(value: object): value is QueryChunkContainer {
  return Array.isArray((value as { queryChunks?: unknown }).queryChunks);
}

function hasValueChunks(value: object): value is ValueChunkContainer {
  return Array.isArray((value as { value?: unknown }).value);
}

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
  if (hasQueryChunks(value)) {
    return value.queryChunks.map(collectSqlText).join("");
  }
  if (hasValueChunks(value)) {
    return value.value.map((chunk) => collectSqlText(chunk)).join("");
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
  if (hasQueryChunks(value)) {
    return value.queryChunks.flatMap((chunk) => collectBoundValues(chunk, false));
  }
  if (hasValueChunks(value)) {
    return value.value.flatMap((chunk) => collectBoundValues(chunk, true));
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
