import { randomUUID } from "node:crypto";
import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "../db-postgres";
import { conflict, notFound } from "../http/errors";
import { VIEWER_FILTER_PRESET_MAX_PER_IMPORT, viewerFilterPresetCreateSchema, viewerFilterPresetNameSchema, viewerFilterPresetSchema, type ViewerFilterPreset, type ViewerFilterPresetCreateInput } from "../../shared/common/viewer-filter-presets";

export type ViewerPresetExecutor = { execute(query: SQLWrapper): Promise<{ rows?: unknown[] }> };
export type ViewerPresetDatabase = ViewerPresetExecutor & { transaction<T>(run: (tx: ViewerPresetExecutor) => Promise<T>): Promise<T> };

function presetFromRow(row: unknown): ViewerFilterPreset | null {
  const parsed = viewerFilterPresetSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export class ViewerFilterPresetsRepository {
  constructor(private readonly database: ViewerPresetDatabase = db) {}

  private async lockScope(tx: ViewerPresetExecutor, ownerUserId: string, importId: string): Promise<void> {
    // This stable owner row serializes quota/name checks and account deletion.
    const owner = await tx.execute(sql`SELECT id FROM public.users WHERE id = ${ownerUserId}
      AND status = 'active' AND coalesce(is_banned, false) = false FOR UPDATE`);
    if (!owner.rows?.length) throw notFound("Preset scope not found.");
    // SHARE conflicts with soft deletion, which updates the import row.
    const dataset = await tx.execute(sql`SELECT id FROM public.imports WHERE id = ${importId} AND is_deleted = false FOR SHARE`);
    if (!dataset.rows?.length) throw notFound("Import not found.");
  }

  async list(ownerUserId: string, importId: string): Promise<ViewerFilterPreset[]> {
    return this.database.transaction(async tx => {
      await this.lockScope(tx, ownerUserId, importId);
      const result = await tx.execute(sql`SELECT p.id, p.name, p.column_filters AS "columnFilters", p.numeric_sort AS "numericSort"
        FROM public.viewer_filter_presets p WHERE p.owner_user_id = ${ownerUserId} AND p.import_id = ${importId}
        ORDER BY lower(p.name), p.id LIMIT ${VIEWER_FILTER_PRESET_MAX_PER_IMPORT}`);
      // Legacy/corrupt rows never become executable filter configuration.
      return (result.rows ?? []).map(presetFromRow).filter((value): value is ViewerFilterPreset => value !== null);
    });
  }

  async create(ownerUserId: string, importId: string, raw: ViewerFilterPresetCreateInput): Promise<ViewerFilterPreset> {
    const input = viewerFilterPresetCreateSchema.parse(raw);
    return this.database.transaction(async tx => {
      await this.lockScope(tx, ownerUserId, importId);
      const current = await tx.execute(sql`SELECT id, name FROM public.viewer_filter_presets
        WHERE owner_user_id = ${ownerUserId} AND import_id = ${importId} LIMIT ${VIEWER_FILTER_PRESET_MAX_PER_IMPORT}`);
      const duplicate = await tx.execute(sql`SELECT id FROM public.viewer_filter_presets
        WHERE owner_user_id = ${ownerUserId} AND import_id = ${importId} AND lower(name) = lower(${input.name}) LIMIT 1`);
      if (duplicate.rows?.length) throw conflict("A preset with this name already exists.");
      if ((current.rows?.length ?? 0) >= VIEWER_FILTER_PRESET_MAX_PER_IMPORT) throw conflict("You can save up to 10 presets for this file.");
      const preset: ViewerFilterPreset = { id: randomUUID(), ...input };
      await tx.execute(sql`INSERT INTO public.viewer_filter_presets (id, owner_user_id, import_id, name, column_filters, numeric_sort)
        VALUES (${preset.id}::uuid, ${ownerUserId}, ${importId}, ${preset.name}, ${JSON.stringify(preset.columnFilters)}::jsonb,
          ${preset.numericSort === null ? null : JSON.stringify(preset.numericSort)}::jsonb)`);
      return preset;
    });
  }

  async rename(ownerUserId: string, importId: string, presetId: string, rawName: string): Promise<ViewerFilterPreset> {
    const name = viewerFilterPresetNameSchema.parse(rawName);
    return this.database.transaction(async tx => {
      await this.lockScope(tx, ownerUserId, importId);
      const owned = await tx.execute(sql`SELECT id FROM public.viewer_filter_presets
        WHERE id = ${presetId}::uuid AND owner_user_id = ${ownerUserId} AND import_id = ${importId}`);
      if (!owned.rows?.length) throw notFound("Preset not found.");
      const duplicate = await tx.execute(sql`SELECT id FROM public.viewer_filter_presets
        WHERE owner_user_id = ${ownerUserId} AND import_id = ${importId} AND id <> ${presetId}::uuid AND lower(name) = lower(${name}) LIMIT 1`);
      if (duplicate.rows?.length) throw conflict("A preset with this name already exists.");
      const updated = await tx.execute(sql`UPDATE public.viewer_filter_presets SET name = ${name}, updated_at = now()
        WHERE id = ${presetId}::uuid AND owner_user_id = ${ownerUserId} AND import_id = ${importId}
        RETURNING id, name, column_filters AS "columnFilters", numeric_sort AS "numericSort"`);
      const preset = presetFromRow(updated.rows?.[0]);
      if (!preset) throw notFound("Preset not found.");
      return preset;
    });
  }

  async delete(ownerUserId: string, importId: string, presetId: string): Promise<void> {
    return this.database.transaction(async tx => {
      await this.lockScope(tx, ownerUserId, importId);
      const deleted = await tx.execute(sql`DELETE FROM public.viewer_filter_presets
        WHERE id = ${presetId}::uuid AND owner_user_id = ${ownerUserId} AND import_id = ${importId} RETURNING id`);
      if (!deleted.rows?.length) throw notFound("Preset not found.");
    });
  }
}
