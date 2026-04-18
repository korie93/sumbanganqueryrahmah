import { z } from "zod";
import { getUiMessage } from "@/lib/i18n/messages";

type ApiContractErrorDetails =
  | {
      reason: "invalid_json";
    }
  | {
      reason: "schema_mismatch";
      issues: readonly z.ZodIssue[];
    };

export class ApiContractError extends Error {
  readonly endpoint: string;
  readonly details: ApiContractErrorDetails;

  constructor(endpoint: string, details: ApiContractErrorDetails) {
    super(getUiMessage("unexpectedApiResponse"));
    this.name = "ApiContractError";
    this.endpoint = endpoint;
    this.details = details;
  }
}

export async function parseApiJson<TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema,
  endpoint: string,
): Promise<z.infer<TSchema>> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiContractError(endpoint, {
      reason: "invalid_json",
    });
  }

  const parsed = schema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  throw new ApiContractError(endpoint, {
    reason: "schema_mismatch",
    issues: parsed.error.issues,
  });
}
