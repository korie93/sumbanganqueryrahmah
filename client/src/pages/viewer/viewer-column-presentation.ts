import type { TableDensity } from "@/hooks/usePersistentTableDensity";
import type { DataRowWithId } from "@/pages/viewer/types";

export type ViewerColumnKind = "text" | "name" | "note" | "identifier" | "date" | "numeric";

function normalizeHeader(header: string) {
  return header.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Presentation hints only: imported values and their types are never changed. */
export function getViewerColumnKind(header: string): ViewerColumnKind {
  const normalized = normalizeHeader(header);
  if (/\b(account|card|phone|telephone|mobile|reference|ref|identifier|ic|nric|passport|postcode|poskod|akaun|kad|telefon|rujukan)\b/.test(normalized)
    || /(?:^| )id$/.test(normalized)) return "identifier";
  if (/\b(note|notes|remark|remarks|description|address|alamat|catatan|keterangan)\b/.test(normalized)) return "note";
  if (/\b(name|nama)\b/.test(normalized)) return "name";
  if (/\b(date|tarikh|timestamp)\b/.test(normalized)) return "date";
  if (/^(amount(?: rm)?|payment amount(?: rm)?|total amount(?: rm)?|jumlah(?: rm| bayaran)?|balance(?: rm)?|outstanding(?: rm)?|total|quantity|qty|count|percentage|percent)$/.test(normalized)) return "numeric";
  return "text";
}

export function getViewerColumnPresentation(header: string, density: TableDensity = "comfortable") {
  const kind = getViewerColumnKind(header);
  const widths: Record<ViewerColumnKind, number> = density === "compact"
    ? { text: 160, name: 216, note: 248, identifier: 168, date: 144, numeric: 128 }
    : { text: 176, name: 240, note: 280, identifier: 184, date: 160, numeric: 144 };
  return { kind, minWidth: widths[kind], align: kind === "numeric" ? "right" as const : "left" as const };
}

export function getViewerTableLayout(headers: string[], density: TableDensity = "comfortable") {
  const columns = headers.map((header) => getViewerColumnPresentation(header, density));
  const minWidth = Math.max(760, 44 + 56 + 48 + columns.reduce((total, column) => total + column.minWidth, 0));
  return {
    columns,
    minWidth,
    gridTemplateColumns: `44px 56px ${columns.map((column) => `minmax(${column.minWidth}px, 1fr)`).join(" ")} 48px`,
  };
}

export function getViewerDetailHeaders(headers: string[]) {
  return [...new Set(headers.filter((header) => header.trim() !== "" && header !== "__rowId"))];
}

export function getViewerDetailFields(row: DataRowWithId, headers: string[]) {
  return getViewerDetailHeaders(headers).map((header) => {
    const value = String(row[header] ?? "");
    return { header, value: value.trim() === "" ? "-" : value };
  });
}

/** Match the existing blank-display rules without confusing a literal dash with missing data. */
export function isViewerDetailValueEmpty(value: unknown) {
  return String(value ?? "").trim() === "";
}

/** Search field names only; preserve the supplied order and exact displayed values. */
export function filterViewerDetailFields(fields: readonly { header: string; value: string }[], search: string) {
  const query = search.trim().toLowerCase();
  return fields.filter(({ header }) => !query || header.toLowerCase().includes(query));
}

/** Resolve only a nonblank identity field in the currently visible columns. */
export function getViewerRowIdentityHeader(row: DataRowWithId, headers: string[]) {
  return headers.find((header) => getViewerColumnKind(header) === "name" && String(row[header] ?? "").trim() !== "");
}

export function getViewerRowIdentity(row: DataRowWithId, headers: string[]) {
  const nameHeader = getViewerRowIdentityHeader(row, headers);
  return nameHeader !== undefined ? String(row[nameHeader]).trim() : `Row ${row.__rowId + 1}`;
}

/** A title represents its own field once, without advancing the preview boundary. */
export function getViewerMobileCardPresentation(row: DataRowWithId, headers: string[]) {
  const identityHeader = getViewerRowIdentityHeader(row, headers);
  const originalPreview = headers.slice(0, 4);
  const previewHeaders = originalPreview.filter((header) => header !== identityHeader);
  const overflowHeaders = headers.slice(4).filter((header) => header !== identityHeader);
  return {
    identityHeader,
    identity: getViewerRowIdentity(row, headers),
    previewHeaders,
    overflowHeaders,
    shownFieldsCount: previewHeaders.length + (identityHeader !== undefined ? 1 : 0),
  };
}
