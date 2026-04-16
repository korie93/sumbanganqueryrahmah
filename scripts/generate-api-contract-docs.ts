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

  if (unwrapped instanceof z.ZodUnknown) {
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

function main() {
  const outputPath = path.resolve("docs/API_CONTRACTS.md");
  const nextContent = renderApiContractsMarkdown();

  if (process.argv.includes("--check")) {
    const currentContent = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, "utf8")
      : "";
    if (currentContent !== nextContent) {
      throw new Error("API contracts documentation is out of date. Run `npm run docs:api`.");
    }
    return;
  }

  fs.writeFileSync(outputPath, nextContent);
}

main();
