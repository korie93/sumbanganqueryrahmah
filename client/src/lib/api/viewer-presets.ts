import { z } from "zod";
import { apiRequest } from "../api-client";
import { parseApiPayload, readApiJsonPayload } from "./contract";
import {
  viewerFilterPresetCreateSchema,
  viewerFilterPresetRenameSchema,
  viewerFilterPresetListResponseSchema,
  viewerFilterPresetResponseSchema,
} from "@shared/common/viewer-filter-presets";

type ViewerPresetOptions = { signal?: AbortSignal | undefined };
type ViewerPresetCreate = z.input<typeof viewerFilterPresetCreateSchema>;
const deletedSchema = z.object({ ok: z.literal(true) }).strict();
const endpoint = (importId: string, presetId?: string) => `/api/imports/${encodeURIComponent(importId)}/viewer-presets${presetId ? `/${encodeURIComponent(presetId)}` : ""}`;

async function parsePresetResponse<TOutput, TInput>(response: Response, schema: z.ZodType<TOutput, TInput>, url: string) {
  const payload = await readApiJsonPayload(response, url, {
    maxRawLength: 1024 * 1024, maxDepth: 8, maxNodes: 4_000, maxStringLength: 1_000,
  });
  return parseApiPayload(payload, schema, url);
}

export async function getViewerFilterPresets(importId: string, options?: ViewerPresetOptions) {
  const url = endpoint(importId);
  const response = await apiRequest("GET", url, undefined, { ...options, retry: false });
  return parsePresetResponse(response, viewerFilterPresetListResponseSchema, url);
}

export async function createViewerFilterPreset(importId: string, payload: ViewerPresetCreate, options?: ViewerPresetOptions) {
  const body = viewerFilterPresetCreateSchema.parse(payload);
  const url = endpoint(importId);
  const response = await apiRequest("POST", url, body, { ...options, retry: false });
  return parsePresetResponse(response, viewerFilterPresetResponseSchema, url);
}

export async function renameViewerFilterPreset(importId: string, presetId: string, name: string, options?: ViewerPresetOptions) {
  const body = viewerFilterPresetRenameSchema.parse({ name });
  const url = endpoint(importId, presetId);
  const response = await apiRequest("PATCH", url, body, { ...options, retry: false });
  return parsePresetResponse(response, viewerFilterPresetResponseSchema, url);
}

export async function deleteViewerFilterPreset(importId: string, presetId: string, options?: ViewerPresetOptions) {
  const url = endpoint(importId, presetId);
  const response = await apiRequest("DELETE", url, undefined, { ...options, retry: false });
  return parsePresetResponse(response, deletedSchema, url);
}
