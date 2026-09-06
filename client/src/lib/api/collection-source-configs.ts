import { z } from "zod";
import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import { isBillingPrincipalDate } from "../billing-principal-date-domain";

export const COLLECTION_SOURCE_CONFIG_CHANGED_EVENT = "collection:source-config-changed";

function notifyCollectionSourceConfigChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COLLECTION_SOURCE_CONFIG_CHANGED_EVENT));
}

const collectionSourceConfigStatusSchema = z.enum([
  "active",
  "upcoming",
  "expired",
  "disabled",
  "incompatible",
]);

const collectionSourceConfigSchema = z.object({
  sourceImportId: z.string().min(1).max(200),
  sourceImportName: z.string().max(500),
  sourceFilename: z.string().max(500),
  rowCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  validFrom: z.string().refine(isBillingPrincipalDate),
  validTo: z.string().refine(isBillingPrincipalDate),
  cycleKey: z.string().min(1).max(100),
  enabled: z.boolean(),
  compatibilityStatus: z.enum(["compatible", "incompatible"]),
  compatibilityIssues: z.array(z.string().min(1).max(200)).max(100),
  indexedRowCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  configuredBy: z.string().max(200),
  configuredAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  status: collectionSourceConfigStatusSchema,
});

export const collectionSourceConfigsResponseSchema = z.object({
  ok: z.literal(true),
  sourceConfigs: z.array(collectionSourceConfigSchema).max(10_000),
});

export const collectionSourceConfigMutationResponseSchema = z.object({
  ok: z.literal(true),
  config: collectionSourceConfigSchema,
});

export const collectionSourceConfigDeleteResponseSchema = z.object({
  ok: z.literal(true),
});

export type CollectionSourceConfigStatus = z.infer<typeof collectionSourceConfigStatusSchema>;
export type CollectionSourceConfig = z.infer<typeof collectionSourceConfigSchema>;

export type CollectionSourceConfigInput = {
  validFrom: string;
  validTo: string;
  enabled: boolean;
};

type CollectionSourceConfigRequestOptions = {
  signal?: AbortSignal | undefined;
};

const sourceConfigsEndpoint = "/api/collection/source-configs";

export async function getCollectionSourceConfigs(options?: CollectionSourceConfigRequestOptions) {
  const response = await apiRequest("GET", sourceConfigsEndpoint, undefined, options);
  return parseApiJson(response, collectionSourceConfigsResponseSchema, sourceConfigsEndpoint);
}

export async function saveCollectionSourceConfig(
  sourceImportId: string,
  input: CollectionSourceConfigInput,
  options?: CollectionSourceConfigRequestOptions,
) {
  const response = await apiRequest(
    "PUT",
    `${sourceConfigsEndpoint}/${encodeURIComponent(sourceImportId)}`,
    input,
    options,
  );
  const result = await parseApiJson(
    response,
    collectionSourceConfigMutationResponseSchema,
    `${sourceConfigsEndpoint}/:id`,
  );
  notifyCollectionSourceConfigChanged();
  return result;
}

export async function deleteCollectionSourceConfig(
  sourceImportId: string,
  options?: CollectionSourceConfigRequestOptions,
) {
  const response = await apiRequest(
    "DELETE",
    `${sourceConfigsEndpoint}/${encodeURIComponent(sourceImportId)}`,
    undefined,
    options,
  );
  const result = await parseApiJson(
    response,
    collectionSourceConfigDeleteResponseSchema,
    `${sourceConfigsEndpoint}/:id`,
  );
  notifyCollectionSourceConfigChanged();
  return result;
}
