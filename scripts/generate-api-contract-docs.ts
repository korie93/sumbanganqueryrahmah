import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  advancedSearchResponseSchema,
  apiErrorPayloadSchema,
  auditLogsResponseSchema,
  deleteImportResponseSchema,
  importDataPageResponseSchema,
  importsListResponseSchema,
  settingsResponseSchema,
  settingsUpdateResponseSchema,
  tabVisibilityResponseSchema,
  searchGlobalResponseSchema,
} from "../shared/api-contracts";

type ApiDocEntry = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  requestSummary: string;
  responseSchema: z.ZodTypeAny;
};

type OpenApiSchema = Record<string, unknown>;

const API_DOC_ENTRIES: ApiDocEntry[] = [
  {
    method: "GET",
    path: "/api/imports",
    description: "Lists imports available to the authenticated user.",
    requestSummary: "Query params: `cursor`, `pageSize`, `search`, `createdOn`.",
    responseSchema: importsListResponseSchema,
  },
  {
    method: "GET",
    path: "/api/imports/:id/data",
    description: "Returns paginated import rows for viewer-style table rendering.",
    requestSummary: "Query params: `page`, `pageSize`, `search`, `cursor`, `columnFilters`.",
    responseSchema: importDataPageResponseSchema,
  },
  {
    method: "DELETE",
    path: "/api/imports/:id",
    description: "Deletes a single import record.",
    requestSummary: "Path param: `id`.",
    responseSchema: deleteImportResponseSchema,
  },
  {
    method: "GET",
    path: "/api/search/global",
    description: "Runs the main global search experience used by the search page.",
    requestSummary: "Query params: `q`, `page`, `pageSize`.",
    responseSchema: searchGlobalResponseSchema,
  },
  {
    method: "POST",
    path: "/api/search/advanced",
    description: "Runs advanced search with structured filters and AND/OR logic.",
    requestSummary: "JSON body: `{ filters, logic, page, pageSize }`.",
    responseSchema: advancedSearchResponseSchema,
  },
  {
    method: "GET",
    path: "/api/audit-logs",
    description: "Returns audit log records with offset pagination.",
    requestSummary: "Query params: `page`, `pageSize`, `action`, `performedBy`, `targetUser`, `search`, `dateFrom`, `dateTo`, `sortBy`.",
    responseSchema: auditLogsResponseSchema,
  },
  {
    method: "GET",
    path: "/api/settings",
    description: "Returns grouped settings data with per-setting permissions.",
    requestSummary: "No request body. Authenticated access only.",
    responseSchema: settingsResponseSchema,
  },
  {
    method: "PATCH",
    path: "/api/settings",
    description: "Updates one setting value while preserving permission checks.",
    requestSummary: "JSON body: `{ key, value, confirmCritical? }`.",
    responseSchema: settingsUpdateResponseSchema,
  },
  {
    method: "GET",
    path: "/api/settings/tab-visibility",
    description: "Returns current tab visibility for the active role.",
    requestSummary: "No request body. Authenticated access only.",
    responseSchema: tabVisibilityResponseSchema,
  },
];

function formatObjectShape(shape: Record<string, z.ZodTypeAny>, indent: number): string {
  const indentation = " ".repeat(indent);
  const lines = Object.entries(shape).map(([key, value]) => {
    const optional = value.isOptional() ? "?" : "";
    const formatted = formatSchema(value, indent + 2);
    if (formatted.includes("\n")) {
      return `${indentation}${key}${optional}: ${formatted}`;
    }
    return `${indentation}${key}${optional}: ${formatted}`;
  });

  return `{\n${lines.join("\n")}\n${" ".repeat(Math.max(indent - 2, 0))}}`;
}

function formatSchema(schema: z.ZodTypeAny, indent = 2): string {
  if (schema instanceof z.ZodDefault) {
    return formatSchema(schema.removeDefault(), indent);
  }

  if (schema instanceof z.ZodOptional) {
    return formatSchema(schema.unwrap(), indent);
  }

  if (schema instanceof z.ZodNullable) {
    return `${formatSchema(schema.unwrap(), indent)} | null`;
  }

  const unwrapped = schema;

  if (unwrapped instanceof z.ZodObject) {
    return formatObjectShape(unwrapped.shape, indent);
  }

  if (unwrapped instanceof z.ZodArray) {
    const inner = formatSchema(unwrapped.element, indent + 2);
    return inner.includes("\n")
      ? `Array<${inner}\n${" ".repeat(Math.max(indent - 2, 0))}>`
      : `Array<${inner}>`;
  }

  if (unwrapped instanceof z.ZodRecord) {
    const valueType = formatSchema(unwrapped._def.valueType, indent + 2);
    return `Record<string, ${valueType}>`;
  }

  if (unwrapped instanceof z.ZodEnum) {
    return unwrapped.options.map((option) => JSON.stringify(option)).join(" | ");
  }

  if (unwrapped instanceof z.ZodLiteral) {
    return JSON.stringify(unwrapped.value);
  }

  if (unwrapped instanceof z.ZodUnion) {
    return unwrapped._def.options.map((option) => formatSchema(option, indent)).join(" | ");
  }

  if (unwrapped instanceof z.ZodString) {
    return "string";
  }

  if (unwrapped instanceof z.ZodNumber) {
    return "number";
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return "boolean";
  }

  if (unwrapped instanceof z.ZodNull) {
    return "null";
  }

  if (unwrapped instanceof z.ZodUnknown || unwrapped instanceof z.ZodLazy) {
    return "unknown";
  }

  return "unknown";
}

function renderApiContractsMarkdown(): string {
  const sections = API_DOC_ENTRIES.map((entry) => {
    return [
      `## ${entry.method} ${entry.path}`,
      "",
      entry.description,
      "",
      `Request summary: ${entry.requestSummary}`,
      "",
      "Response contract:",
      "",
      "```text",
      formatSchema(entry.responseSchema),
      "```",
    ].join("\n");
  }).join("\n\n");

  return [
    "# API Contracts",
    "",
    "This file is generated from `shared/api-contracts.ts` plus the public route metadata in `scripts/generate-api-contract-docs.ts`.",
    "Regenerate it with `npm run docs:api`.",
    "",
    "Only stable, client-facing authenticated routes are documented here on purpose. Internal-only, operational, and debug-only routes stay out of this document to reduce drift and accidental exposure.",
    "The same source-of-truth also produces `docs/openapi.public.json` for Swagger/OpenAPI tooling.",
    "",
    "## Shared error envelope",
    "",
    "```text",
    formatSchema(apiErrorPayloadSchema),
    "```",
    "",
    sections,
    "",
  ].join("\n");
}

function buildOpenApiPath(routePath: string) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function buildOperationId(entry: ApiDocEntry) {
  const normalizedPath = entry.path
    .replace(/\/:([A-Za-z0-9_]+)/g, "-by-$1")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${entry.method.toLowerCase()}-${normalizedPath}`;
}

function buildPathParameters(routePath: string) {
  return Array.from(routePath.matchAll(/:([A-Za-z0-9_]+)/g)).map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: {
      type: "string",
    },
  }));
}

function buildLiteralSchema(value: unknown): OpenApiSchema {
  if (value === null) {
    return {
      type: "null",
    };
  }

  switch (typeof value) {
    case "string":
      return { type: "string", const: value };
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number", const: value };
    case "boolean":
      return { type: "boolean", const: value };
    default:
      return { const: value };
  }
}

function convertZodSchemaToOpenApiSchema(
  schema: z.ZodTypeAny,
  seen = new Set<z.ZodTypeAny>(),
): OpenApiSchema {
  if (schema instanceof z.ZodDefault) {
    return convertZodSchemaToOpenApiSchema(schema.removeDefault(), seen);
  }

  if (schema instanceof z.ZodOptional) {
    return convertZodSchemaToOpenApiSchema(schema.unwrap(), seen);
  }

  if (schema instanceof z.ZodNullable) {
    return {
      ...convertZodSchemaToOpenApiSchema(schema.unwrap(), seen),
      nullable: true,
    };
  }

  if (schema instanceof z.ZodLazy) {
    if (seen.has(schema)) {
      return {};
    }

    seen.add(schema);
    const resolved = convertZodSchemaToOpenApiSchema(schema._def.getter(), seen);
    seen.delete(schema);
    return resolved;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [
        key,
        convertZodSchemaToOpenApiSchema(value, seen),
      ]),
    );
    const required = Object.entries(shape)
      .filter(([, value]) => !value.isOptional())
      .map(([key]) => key);

    return {
      type: "object",
      properties,
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: convertZodSchemaToOpenApiSchema(schema.element, seen),
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: convertZodSchemaToOpenApiSchema(schema._def.valueType, seen),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: [...schema.options],
    };
  }

  if (schema instanceof z.ZodLiteral) {
    return buildLiteralSchema(schema.value);
  }

  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: schema._def.options.map((option) => convertZodSchemaToOpenApiSchema(option, seen)),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodNull) {
    return { type: "null" };
  }

  if (schema instanceof z.ZodUnknown) {
    return {};
  }

  return {};
}

function buildOpenApiDocument() {
  const paths = Object.fromEntries(
    API_DOC_ENTRIES.map((entry) => [
      buildOpenApiPath(entry.path),
      {
        [entry.method.toLowerCase()]: {
          operationId: buildOperationId(entry),
          summary: entry.description,
          description: `${entry.description}\n\n${entry.requestSummary}`,
          tags: ["public-client"],
          parameters: buildPathParameters(entry.path),
          responses: {
            "200": {
              description: "Successful response.",
              content: {
                "application/json": {
                  schema: convertZodSchemaToOpenApiSchema(entry.responseSchema),
                },
              },
            },
            default: {
              description: "Standard API error response.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ApiError",
                  },
                },
              },
            },
          },
        },
      },
    ]),
  );

  return {
    openapi: "3.1.0",
    info: {
      title: "SQR Public API",
      version: "1.0.0",
      description: [
        "Generated from `shared/api-contracts.ts` and `scripts/generate-api-contract-docs.ts`.",
        "This document intentionally covers only stable, client-facing authenticated routes.",
      ].join(" "),
    },
    servers: [
      {
        url: "/",
      },
    ],
    paths,
    components: {
      schemas: {
        ApiError: convertZodSchemaToOpenApiSchema(apiErrorPayloadSchema),
      },
    },
  };
}

function writeGeneratedFile(outputPath: string, nextContent: string, checkMode: boolean) {
  const currentContent = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";

  if (checkMode) {
    if (currentContent !== nextContent) {
      throw new Error(`Generated API documentation is out of date for ${path.relative(process.cwd(), outputPath)}.`);
    }
    return;
  }

  fs.writeFileSync(outputPath, nextContent);
}

function main() {
  const markdownOutputPath = path.resolve("docs/API_CONTRACTS.md");
  const openApiOutputPath = path.resolve("docs/openapi.public.json");
  const checkMode = process.argv.includes("--check");
  const markdownContent = renderApiContractsMarkdown();
  const openApiContent = JSON.stringify(buildOpenApiDocument(), null, 2).concat("\n");

  writeGeneratedFile(markdownOutputPath, markdownContent, checkMode);
  writeGeneratedFile(openApiOutputPath, openApiContent, checkMode);
}

main();
