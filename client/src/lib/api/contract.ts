import { z } from "zod";
import { safeJsonParseResult, type SafeJsonParseOptions } from "@/lib/utils/safe-json";

const API_RESPONSE_JSON_LIMITS: SafeJsonParseOptions = {
  maxDepth: 50,
  maxNodes: 200_000,
  maxRawLength: 8 * 1024 * 1024,
  maxStringLength: 1_000_000,
};

function isDevApiContractDiagnosticsEnabled() {
  return Boolean(import.meta.env?.DEV);
}

function formatIssuePath(path: Array<string | number>) {
  if (path.length === 0) {
    return "<root>";
  }

  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");
}

function buildApiContractMismatchMessage(endpoint: string, error: z.ZodError) {
  const maxIssues = isDevApiContractDiagnosticsEnabled() ? error.issues.length : 3;
  const visibleIssues = error.issues.slice(0, maxIssues);
  const formattedIssues = visibleIssues.map((issue) => (
    `${formatIssuePath(issue.path)}: ${issue.message}`
  ));
  const remainingIssueCount = Math.max(0, error.issues.length - visibleIssues.length);
  const messageParts = [`${error.issues.length} issue${error.issues.length === 1 ? "" : "s"}`];

  if (formattedIssues.length > 0) {
    messageParts.push(formattedIssues.join("; "));
  }

  if (remainingIssueCount > 0) {
    messageParts.push(`+${remainingIssueCount} more`);
  }

  return `API contract mismatch for ${endpoint} (${messageParts.join("; ")})`;
}

export function parseApiPayload<TSchema extends z.ZodTypeAny>(
  payload: unknown,
  schema: TSchema,
  endpoint: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(buildApiContractMismatchMessage(endpoint, parsed.error));
}

export async function parseApiJson<TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema,
  endpoint: string,
): Promise<z.infer<TSchema>> {
  return parseApiPayload(await readApiJsonPayload(response, endpoint), schema, endpoint);
}

export async function readApiJsonPayload<T = unknown>(
  response: Response,
  endpoint: string,
  options?: SafeJsonParseOptions,
): Promise<T> {
  const raw = await response.text();
  const parsed = safeJsonParseResult<T>(raw, {
    ...API_RESPONSE_JSON_LIMITS,
    ...options,
  });

  if (!parsed.ok) {
    throw new Error(`API response JSON parse failed for ${endpoint}: ${parsed.error}`);
  }

  return parsed.data;
}
