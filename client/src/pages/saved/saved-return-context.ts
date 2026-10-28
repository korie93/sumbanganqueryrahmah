import { SAVED_WORKSPACE_VIEWS, type SavedWorkspaceView } from "@/pages/saved/saved-workspace";

export type SavedReturnQuery = {
  page: number;
  pageSize: number;
  searchTerm: string;
  uploaderFilter: string;
  createdOn?: string | undefined;
  minRowsFilter: string;
  maxRowsFilter: string;
  workspaceView: SavedWorkspaceView;
};

export type SavedReturnContext = {
  query: SavedReturnQuery;
  importId: string;
  scroll: { windowX: number; windowY: number; listLeft: number; listTop: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2048;
}

function hasDataFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function isScrollOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** Reconstructs a valid calendar date locally without changing it through UTC conversion. */
export function parseSavedReturnDate(createdOn?: string): Date | undefined {
  if (typeof createdOn !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(createdOn);
  if (!match) return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : undefined;
}

/** Captures the selected local calendar day without a timezone-dependent ISO timestamp. */
export function formatSavedReturnDate(date?: Date): string | undefined {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return undefined;
  const year = date.getFullYear();
  if (year < 1 || year > 9999) return undefined;
  return [String(year).padStart(4, "0"), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

/** Copies only bounded navigation metadata; file rows and arbitrary extra values are discarded. */
export function normalizeSavedReturnContext(value: unknown): SavedReturnContext | null {
  if (!isRecord(value) || !hasDataFields(value, ["query", "scroll", "importId"])
    || !isRecord(value.query) || !isRecord(value.scroll)) return null;
  const { query, scroll } = value;
  if (!hasDataFields(query, ["page", "pageSize", "searchTerm", "uploaderFilter",
    "minRowsFilter", "maxRowsFilter", "workspaceView"])
    || !hasDataFields(scroll, ["windowX", "windowY", "listLeft", "listTop"])) return null;
  const dateField = Object.getOwnPropertyDescriptor(query, "createdOn");
  if (dateField && !("value" in dateField)) return null;
  const createdOn: unknown = dateField?.value;
  if (typeof value.importId !== "string" || !value.importId.trim() || value.importId.length > 256
    || hasControlCharacter(value.importId)) return null;
  if (typeof query.page !== "number" || !Number.isSafeInteger(query.page)
    || query.page < 1 || query.page > 1_000_000) return null;
  if (typeof query.pageSize !== "number" || ![10, 20, 30, 40, 50].includes(query.pageSize)) return null;
  if (!isBoundedText(query.searchTerm) || !isBoundedText(query.uploaderFilter)
    || !isBoundedText(query.minRowsFilter) || !isBoundedText(query.maxRowsFilter)) return null;
  if (typeof query.workspaceView !== "string"
    || !SAVED_WORKSPACE_VIEWS.some((view) => view === query.workspaceView)) return null;
  if (createdOn !== undefined
    && (typeof createdOn !== "string" || !parseSavedReturnDate(createdOn))) return null;
  if (!isScrollOffset(scroll.windowX) || !isScrollOffset(scroll.windowY)
    || !isScrollOffset(scroll.listLeft) || !isScrollOffset(scroll.listTop)) return null;
  return {
    importId: value.importId,
    query: {
      page: query.page, pageSize: query.pageSize,
      searchTerm: query.searchTerm, uploaderFilter: query.uploaderFilter,
      minRowsFilter: query.minRowsFilter, maxRowsFilter: query.maxRowsFilter,
      workspaceView: query.workspaceView as SavedWorkspaceView,
      ...(createdOn === undefined ? {} : { createdOn }),
    },
    scroll: { windowX: scroll.windowX, windowY: scroll.windowY,
      listLeft: scroll.listLeft, listTop: scroll.listTop },
  };
}
