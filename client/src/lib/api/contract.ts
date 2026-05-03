import { z } from "zod";

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

export async function parseApiJson<TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema,
  endpoint: string,
): Promise<z.infer<TSchema>> {
  const payload = await response.json();
  const parsed = schema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(buildApiContractMismatchMessage(endpoint, parsed.error));
}
