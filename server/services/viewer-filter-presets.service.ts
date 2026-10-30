import { viewerFilterPresetCreateSchema, type ViewerFilterPresetCreateInput } from "../../shared/common/viewer-filter-presets";
import { badRequest, notFound } from "../http/errors";
import type { ImportsRepository } from "../repositories/imports.repository";
import type { ViewerFilterPresetsRepository } from "../repositories/viewer-filter-presets.repository";

export class ViewerFilterPresetsService {
  constructor(private readonly presets: Pick<ViewerFilterPresetsRepository, "list" | "create" | "rename" | "delete">,
    private readonly imports: Pick<ImportsRepository, "getImportById" | "getImportColumnNames">) {}

  list(ownerUserId: string, importId: string) { return this.presets.list(ownerUserId, importId); }

  async create(ownerUserId: string, importId: string, raw: ViewerFilterPresetCreateInput) {
    const input = viewerFilterPresetCreateSchema.parse(raw);
    if (!await this.imports.getImportById(importId)) throw notFound("Import not found.");
    const headers = new Set(await this.imports.getImportColumnNames(importId));
    if (input.columnFilters.some(filter => !headers.has(filter.column)) || (input.numericSort && !headers.has(input.numericSort.column))) {
      throw badRequest("This preset contains a column that is not available in this file.");
    }
    return this.presets.create(ownerUserId, importId, input);
  }

  rename(ownerUserId: string, importId: string, presetId: string, name: string) { return this.presets.rename(ownerUserId, importId, presetId, name); }
  delete(ownerUserId: string, importId: string, presetId: string) { return this.presets.delete(ownerUserId, importId, presetId); }
}
