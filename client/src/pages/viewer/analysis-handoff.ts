import { z } from "zod";
import {
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

export const VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY = "viewerAnalysisHandoff";

const viewerAnalysisHandoffSchema = z.object({
  focusColumn: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(2).max(200).optional(),
}).strict().refine(
  (value) => Boolean(value.focusColumn || value.search),
  "A Viewer analysis handoff requires a column or search value.",
);

export type ViewerAnalysisHandoff = z.infer<typeof viewerAnalysisHandoffSchema>;

type ViewerAnalysisSelection = ViewerAnalysisHandoff & {
  importId: string;
  importName: string;
};

type ViewerAnalysisStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function restoreStorageItem(
  storage: ViewerAnalysisStorage | null | undefined,
  key: string,
  previousValue: string | null,
) {
  if (previousValue === null) {
    safeRemoveStorageItem(storage, key);
    return;
  }

  safeSetStorageItem(storage, key, previousValue);
}

export function storeViewerAnalysisSelection(
  localStorage: ViewerAnalysisStorage | null | undefined,
  sessionStorage: ViewerAnalysisStorage | null | undefined,
  selection: ViewerAnalysisSelection,
) {
  const handoff = viewerAnalysisHandoffSchema.safeParse({
    focusColumn: selection.focusColumn,
    search: selection.search,
  });
  if (!handoff.success) {
    return false;
  }

  const importId = selection.importId.trim();
  const importName = selection.importName.trim();
  if (!importId || !importName) {
    return false;
  }

  const previousImportId = safeGetStorageItem(localStorage, "selectedImportId");
  const previousImportName = safeGetStorageItem(localStorage, "selectedImportName");
  const previousHandoff = safeGetStorageItem(
    sessionStorage,
    VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY,
  );
  const importStored =
    safeSetStorageItem(localStorage, "selectedImportId", importId) &&
    safeSetStorageItem(localStorage, "selectedImportName", importName);
  if (!importStored) {
    restoreStorageItem(localStorage, "selectedImportId", previousImportId);
    restoreStorageItem(localStorage, "selectedImportName", previousImportName);
    return false;
  }

  const handoffStored = safeSetStorageItem(
    sessionStorage,
    VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY,
    JSON.stringify(handoff.data),
  );
  if (!handoffStored) {
    restoreStorageItem(localStorage, "selectedImportId", previousImportId);
    restoreStorageItem(localStorage, "selectedImportName", previousImportName);
    restoreStorageItem(
      sessionStorage,
      VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY,
      previousHandoff,
    );
    return false;
  }

  return true;
}

export function consumeViewerAnalysisHandoff(
  storage: Pick<Storage, "getItem" | "removeItem"> | null | undefined,
): ViewerAnalysisHandoff | null {
  const rawValue = safeGetStorageItem(storage, VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY);
  safeRemoveStorageItem(storage, VIEWER_ANALYSIS_HANDOFF_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  const parsedJson = safeJsonParseResult<unknown>(rawValue, {
    maxDepth: 4,
    maxRawLength: 2_048,
  });
  if (!parsedJson.ok) {
    return null;
  }

  const parsed = viewerAnalysisHandoffSchema.safeParse(parsedJson.data);
  return parsed.success ? parsed.data : null;
}
