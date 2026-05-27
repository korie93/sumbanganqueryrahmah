import assert from "node:assert/strict";
import test from "node:test";
import {
  assertJsonValueDepth,
  jsonObjectSchema,
  jsonValueSchema,
  MAX_JSON_SCHEMA_DEPTH,
  SchemaDepthError,
  type JsonValue,
} from "./json-schema";

function buildNestedObject(depth: number): JsonValue {
  let value: JsonValue = "leaf";
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

function buildNestedArray(depth: number): JsonValue {
  let value: JsonValue = "leaf";
  for (let index = 0; index < depth; index += 1) {
    value = [value];
  }
  return value;
}

test("jsonValueSchema accepts JSON values at and below the configured depth", () => {
  assert.doesNotThrow(() => jsonValueSchema.parse(buildNestedObject(9)));
  assert.doesNotThrow(() => jsonValueSchema.parse(buildNestedObject(MAX_JSON_SCHEMA_DEPTH)));
  assert.doesNotThrow(() => jsonValueSchema.parse(buildNestedArray(MAX_JSON_SCHEMA_DEPTH)));
});

test("jsonValueSchema rejects JSON values deeper than the configured limit", () => {
  assert.throws(
    () => jsonValueSchema.parse(buildNestedObject(MAX_JSON_SCHEMA_DEPTH + 1)),
    SchemaDepthError,
  );
  assert.throws(
    () => jsonValueSchema.parse(buildNestedArray(MAX_JSON_SCHEMA_DEPTH + 1)),
    SchemaDepthError,
  );
});

test("jsonObjectSchema applies the same depth limit at object entry points", () => {
  assert.doesNotThrow(() => jsonObjectSchema.parse(buildNestedObject(MAX_JSON_SCHEMA_DEPTH)));
  assert.throws(
    () => jsonObjectSchema.parse(buildNestedObject(MAX_JSON_SCHEMA_DEPTH + 1)),
    SchemaDepthError,
  );
});

test("assertJsonValueDepth rejects cyclic malicious payloads before recursive validation", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  assert.throws(
    () => assertJsonValueDepth(cyclic),
    /must not contain circular references/i,
  );
});
