import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export const MAX_JSON_SCHEMA_DEPTH = 10;

export class SchemaDepthError extends Error {
  constructor(maxDepth = MAX_JSON_SCHEMA_DEPTH) {
    super(`JSON value exceeds maximum supported depth of ${maxDepth}.`);
    this.name = "SchemaDepthError";
  }
}

const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || (typeof value === "object" && value !== null);
}

export function assertJsonValueDepth(
  value: unknown,
  maxDepth = MAX_JSON_SCHEMA_DEPTH,
): void {
  const seen = new WeakSet<object>();

  function visit(current: unknown, depth: number): void {
    if (depth > maxDepth) {
      throw new SchemaDepthError(maxDepth);
    }

    if (!isJsonContainer(current)) {
      return;
    }

    if (seen.has(current)) {
      throw new Error("JSON value must not contain circular references.");
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item, depth + 1);
      }
      return;
    }

    for (const item of Object.values(current)) {
      visit(item, depth + 1);
    }
  }

  visit(value, 0);
}

const jsonValueShapeSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueShapeSchema),
    z.record(jsonValueShapeSchema),
  ]),
);

export const jsonValueSchema: z.ZodType<JsonValue> = z.preprocess((value) => {
  assertJsonValueDepth(value);
  return value;
}, jsonValueShapeSchema) as z.ZodType<JsonValue>;

export const jsonObjectSchema: z.ZodType<JsonObject> = z.preprocess((value) => {
  assertJsonValueDepth(value);
  return value;
}, z.record(jsonValueShapeSchema)) as z.ZodType<JsonObject>;
