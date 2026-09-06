import type { AuthenticatedUser } from "../../auth/guards";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../../http/errors";
import {
  formatCollectionOspMoneyCents,
  parseCollectionOspMoneyCents,
} from "../../lib/collection-osp-reconciliation";
import { CollectionOspV7RepositoryError } from "../../repositories/collection-osp-v7-repository-utils";
import {
  COLLECTION_AGING_BUCKETS,
  ensureLooseObject,
  isValidCollectionDate,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type {
  CollectionAgingBucket,
  CollectionOspSavedTargetView,
  CollectionOspTargetInput,
  CollectionOspViewer,
} from "../../storage-postgres-collection-types";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  CollectionOspV7ExportGuardError,
  createCollectionOspV7ExportGuard,
  type CollectionOspV7ExportGuard,
} from "./collection-osp-v7-export-guard";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;
const AGINGS: CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERCENTAGE_PATTERN = /^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/;
const UNSAFE_MARKUP_PATTERN = /<\/?[a-z][^>]*>|(?:javascript|data)\s*:/i;
const MAX_SAVED_BASELINE_CENTS = 9_999_999_999_999_999n; // NUMERIC(16,2), including large source totals.
export const MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS = 10_000;
export const MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES = 16 * 1024 * 1024;
const REPORT_VIEWER_ROLES = new Set(["admin", "manager", "superuser"]);

function requireReportViewer(user: AuthenticatedUser): void {
  if (!user.userId || !REPORT_VIEWER_ROLES.has(String(user.role).toLowerCase())) {
    throw forbidden("Only Collection report viewers can access Saved Billing Principal reports.");
  }
}

function requireSuperuser(user: AuthenticatedUser): void {
  requireReportViewer(user);
  if (String(user.role).toLowerCase() !== "superuser") {
    throw forbidden("Only superuser can manage shared Saved Billing Principal targets.");
  }
}

function viewerScope(user: AuthenticatedUser): CollectionOspViewer {
  requireReportViewer(user);
  return { userId: user.userId!, role: String(user.role).toLowerCase() };
}

function readUuid(value: unknown, label: string): string {
  const normalized = normalizeCollectionText(value);
  if (!UUID_PATTERN.test(normalized)) throw badRequest(`${label} is invalid.`);
  return normalized;
}

function readDate(value: unknown, label: string): string {
  const normalized = normalizeCollectionText(value);
  if (!isValidCollectionDate(normalized)) throw badRequest(`${label} must be a valid date in YYYY-MM-DD format.`);
  return normalized;
}

function currentBusinessDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function targetTrackingRange(target: CollectionOspSavedTargetView) {
  return {
    start: target.activeRevision.from,
    end: target.activeRevision.to,
  };
}

function defaultTargetAsOf(target: CollectionOspSavedTargetView): string {
  const { start, end } = targetTrackingRange(target);
  const today = currentBusinessDate();
  return today < start ? start : today > end ? end : today;
}

function readBoundedText(
  value: unknown,
  label: string,
  maxLength: number,
  options?: { required?: boolean; rejectMarkup?: boolean },
): string | null {
  const normalized = normalizeCollectionText(value);
  if (!normalized) {
    if (options?.required) throw badRequest(`${label} is required.`);
    return null;
  }
  if (normalized.length > maxLength) throw badRequest(`${label} exceeds ${maxLength} characters.`);
  if (Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 8) || code === 11 || code === 12
      || (code >= 14 && code <= 31) || code === 127;
  })) throw badRequest(`${label} contains invalid control characters.`);
  if (options?.rejectMarkup !== false && UNSAFE_MARKUP_PATTERN.test(normalized)) {
    throw badRequest(`${label} must be plain text without HTML or script content.`);
  }
  return normalized;
}

function readStringList(value: unknown, maxItems: number, itemMaxLength: number): string[] {
  const pending = Array.isArray(value) ? value : value == null ? [] : [value];
  const values = normalizeCollectionStringList(pending.flatMap((entry) =>
    normalizeCollectionText(entry).split(",").map((part) => part.trim()).filter(Boolean)));
  if (values.length > maxItems || values.some((entry) => entry.length > itemMaxLength)) {
    throw badRequest(`List must contain at most ${maxItems} valid values.`);
  }
  return values;
}

function readAging(value: unknown, optional = false): CollectionAgingBucket | undefined {
  const aging = normalizeCollectionText(value).toUpperCase();
  if (!aging && optional) return undefined;
  if (!COLLECTION_AGING_BUCKETS.has(aging)) throw badRequest("Aging must be D3, D4, D5, or D6.");
  return aging as CollectionAgingBucket;
}

function readMoney(value: unknown, label: string, allowZero: boolean): string {
  try {
    const cents = parseCollectionOspMoneyCents(value, allowZero);
    if (cents > MAX_SAVED_BASELINE_CENTS) throw new Error("too_large");
    return formatCollectionOspMoneyCents(cents);
  } catch {
    throw badRequest(`${label} must be an exact MYR amount with at most two decimals.`);
  }
}

function readPercentage(value: unknown, label: string): string {
  const normalized = normalizeCollectionText(value).replace(/%$/, "").trim();
  if (!PERCENTAGE_PATTERN.test(normalized)) {
    throw badRequest(`${label} must be between 0 and 100 with at most four decimals.`);
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  return `${BigInt(whole).toString()}.${`${fraction}0000`.slice(0, 4)}`;
}

function readPositiveInteger(value: unknown, label: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw badRequest(`${label} must be between 1 and ${max}.`);
  }
  return parsed;
}

function readPagination(query: Record<string, unknown>) {
  return {
    page: query.page == null ? 1 : readPositiveInteger(query.page, "Page", 1_000_000),
    pageSize: query.pageSize == null ? 20 : readPositiveInteger(query.pageSize, "Page size", 100),
  };
}

function readTargetRows(
  value: unknown,
  agingScope: readonly CollectionAgingBucket[],
): CollectionOspTargetInput[] {
  if (!Array.isArray(value) || value.length !== agingScope.length) {
    throw badRequest("Saved Target rows must match the selected aging scope exactly.");
  }
  const rows = value.map((entry) => {
    const item = ensureLooseObject(entry);
    if (!item) throw badRequest("Saved Target row is invalid.");
    const agingBucket = readAging(item.agingBucket ?? item.aging)!;
    const baselineRaw = normalizeCollectionText(item.totalOspBaseline);
    return {
      agingBucket,
      totalOspBaseline: baselineRaw ? readMoney(baselineRaw, `${agingBucket} TT OSP`, true) : null,
      targetPercentage: readPercentage(item.targetPercentage, `${agingBucket} target percentage`),
    };
  });
  const submittedAgings = Array.from(new Set(rows.map((row) => row.agingBucket))).sort();
  const scopedAgings = [...agingScope].sort();
  if (
    submittedAgings.length !== scopedAgings.length
    || submittedAgings.some((aging, index) => aging !== scopedAgings[index])
  ) {
    throw badRequest("Saved Target rows must include every selected aging exactly once and no out-of-scope aging.");
  }
  return rows;
}

function normalizeRepositoryError(error: unknown): never {
  if (error instanceof CollectionOspV7RepositoryError) {
    if (error.reason === "NOT_FOUND" || error.reason === "DELETED") {
      throw notFound(error.message, "COLLECTION_OSP_TARGET_NOT_FOUND");
    }
    if (error.reason === "VERSION_CONFLICT") {
      throw conflict(
        error.message,
        /client result/i.test(error.message)
          ? "COLLECTION_OSP_CLIENT_RESULT_VERSION_CONFLICT"
          : "COLLECTION_OSP_TARGET_VERSION_CONFLICT",
      );
    }
    if (error.reason === "BASELINE_MISMATCH") {
      throw conflict(error.message, "COLLECTION_OSP_BASELINE_MISMATCH");
    }
    if (error.reason === "DATASET_TOO_LARGE") {
      throw new HttpError(413, error.message);
    }
    throw badRequest(error.message, "COLLECTION_OSP_SOURCE_INVALID");
  }
  throw error;
}

function countDays(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

const NUMERIC_EXPORT_FIELD = /(?:amount|osp|percentage|count|version|totalDue|cumulative|remaining)/i;

function hasSpreadsheetFormulaPrefix(value: string): boolean {
  let index = 0;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    const character = value[index] ?? "";
    if (code > 32 && code !== 127 && !/\s/u.test(character)) break;
    index += 1;
  }
  return "=+-@".includes(value[index] ?? "");
}

type ExportColumn = readonly [header: string, sourceField: string];
type ExportSection = readonly [name: string, rows: Array<Record<string, unknown>>];

const SYSTEM_RESULT_EXPORT_COLUMNS: readonly ExportColumn[] = [
  ["Aging", "aging"],
  ["TT OSP", "totalOsp"],
  ["Target Percentage", "targetPercentage"],
  ["Target OSP", "targetOsp"],
  ["Result Percentage", "resultPercentage"],
  ["OSP Closed", "ospClosed"],
  ["Closed Account Count", "closedAccountCount"],
  ["Balance OSP", "balanceOsp"],
];
const CLIENT_RESULT_EXPORT_COLUMNS: readonly ExportColumn[] = [
  ["Aging", "aging"],
  ["TT OSP", "totalOsp"],
  ["Target Percentage", "targetPercentage"],
  ["Target OSP", "targetOsp"],
  ["Client Result Percentage", "resultPercentage"],
  ["Client OSP Closed", "ospClosed"],
  ["Balance OSP", "balanceOsp"],
];
const COMPARISON_EXPORT_COLUMNS: readonly ExportColumn[] = [
  ["System As Of", "systemAsOf"],
  ["System TT OSP", "systemTotalOsp"],
  ["System OSP Closed", "systemOspClosed"],
  ["System Latest Result Percentage", "systemResultPercentage"],
  ["Client Last Updated", "clientLastUpdatedAt"],
  ["Client TT OSP", "clientTotalOsp"],
  ["Client OSP Closed", "clientOspClosed"],
  ["Client Latest Result Percentage", "clientResultPercentage"],
  ["Difference Percentage Points", "differencePercentagePoints"],
];
const CALENDAR_EXPORT_COLUMNS: readonly ExportColumn[] = [
  ["Date", "date"],
  ["Aging", "aging"],
  ["TT OSP", "totalOsp"],
  ["Target OSP", "targetOsp"],
  ["System OSP Closed Today", "systemOspClosedToday"],
  ["System Cumulative OSP Closed", "systemCumulativeOspClosed"],
  ["System Result Percentage", "systemResultPercentage"],
  ["System Previous Result Percentage", "systemPreviousResultPercentage"],
  ["System Daily Movement Percentage Points", "systemDailyMovementPercentagePoints"],
  ["System Achievement vs Target Percentage", "systemAchievementVsTargetPercentage"],
  ["System Daily Accounts", "systemDailyAccounts"],
  ["Balance OSP", "balanceOsp"],
];

function safeSpreadsheetCell(value: unknown, field = ""): string | number | Date {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  if (NUMERIC_EXPORT_FIELD.test(field) && /^-?\d+(?:\.\d+)?$/.test(text)) {
    const unsigned = text.startsWith("-") ? text.slice(1) : text;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const scaled = BigInt(`${whole}${fraction}` || "0");
    if (scaled <= BigInt(Number.MAX_SAFE_INTEGER)) {
      const numeric = Number(text);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  if (/(?:date|At)$/i.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00.000Z`);
  }
  return hasSpreadsheetFormulaPrefix(text) ? `'${text}` : text;
}

function flattenRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
}

function exportTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeCollectionText(entry)).filter(Boolean)
    : [];
}

function flattenSummaryRows(value: unknown, label: string): Array<Record<string, unknown>> {
  const section = ensureLooseObject(value) ?? {};
  const rows = flattenRows(section.rows);
  const all = ensureLooseObject(section.all);
  if (!all) throw new Error(`Billing Principal export is missing the ${label} total row.`);
  return [...rows, all];
}

function projectExportRows(
  rows: Array<Record<string, unknown>>,
  columns: readonly ExportColumn[],
): Array<Record<string, unknown>> {
  return rows.map((row) => Object.fromEntries(columns.map(([header, sourceField]) => [header, row[sourceField]])));
}

function readExportTotal(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Billing Principal export is missing a valid ${label} total.`);
  }
  return parsed;
}

function assertCompleteDetailRows(
  rows: Array<Record<string, unknown>>,
  totalValue: unknown,
  label: string,
): void {
  const total = readExportTotal(totalValue, label);
  if (rows.length !== total) {
    throw new Error(
      `Billing Principal export stopped before all ${label} rows were loaded (${rows.length.toLocaleString("en-MY")} of ${total.toLocaleString("en-MY")}).`,
    );
  }
}

function estimateExportValueBytes(value: unknown, ancestors = new Set<unknown>()): number {
  if (value === null || value === undefined) return 4;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8") + 2;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).length;
  }
  if (value instanceof Date) return value.toISOString().length + 2;
  if (typeof value !== "object" || ancestors.has(value)) return 0;
  // Track only the active path. Repeated references are serialized repeatedly by
  // JSON and must therefore be counted repeatedly; cycles are still bounded.
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return 2 + value.reduce((total, entry) => total + estimateExportValueBytes(entry, ancestors) + 1, 0);
    }
    return 2 + Object.entries(value as Record<string, unknown>).reduce(
      (total, [key, entry]) => total + Buffer.byteLength(key, "utf8") + 3 + estimateExportValueBytes(entry, ancestors),
      0,
    );
  } finally {
    ancestors.delete(value);
  }
}

export function assertCollectionOspV7ExportWithinLimits(dataset: Record<string, unknown>): void {
  const drilldown = flattenRows(dataset.drilldown);
  const detailRows = drilldown.length;
  if (detailRows > MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS) {
    throw new HttpError(
      413,
      `Billing Principal export exceeds the ${MAX_COLLECTION_OSP_V7_EXPORT_DETAIL_ROWS.toLocaleString("en-MY")} detail-row limit. Narrow the date, aging, or contribution filters and try again.`,
    );
  }
  const estimatedBytes = estimateExportValueBytes(dataset);
  if (estimatedBytes > MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES) {
    throw new HttpError(
      413,
      `Billing Principal export exceeds the ${(MAX_COLLECTION_OSP_V7_EXPORT_ESTIMATED_BYTES / (1024 * 1024)).toFixed(0)} MB safety limit. Narrow the date, aging, or contribution filters and try again.`,
    );
  }
}

function buildExportMetadata(dataset: Record<string, unknown>): Array<Record<string, unknown>> {
  const overview = ensureLooseObject(dataset.overview) ?? {};
  const target = ensureLooseObject(overview.target) ?? {};
  const revision = ensureLooseObject(overview.revision)
    ?? ensureLooseObject(target.activeRevision)
    ?? {};
  const sources = flattenRows(revision.sourceSnapshots);
  const sourceLabels = sources
    .map((source) => {
      const name = normalizeCollectionText(source.name);
      const filename = normalizeCollectionText(source.filename);
      return [name, filename].filter(Boolean).join(" — ");
    })
    .filter(Boolean)
    .join("; ");
  const filters = ensureLooseObject(dataset.filters) ?? {};
  const calendar = flattenRows(dataset.calendar);
  const drilldown = flattenRows(dataset.drilldown);
  assertCompleteDetailRows(drilldown, dataset.drilldownTotal, "drilldown");
  return [
    { Field: "Target Name", Value: target.name ?? "" },
    { Field: "Assigned Admin", Value: ensureLooseObject(target.assignedAdmin)?.username ?? "Legacy — unassigned" },
    { Field: "Assigned Admin Name", Value: ensureLooseObject(target.assignedAdmin)?.fullName ?? "" },
    { Field: "Private Client Owner", Value: dataset.generatedBy ?? "" },
    { Field: "Private Client State", Value: ensureLooseObject(ensureLooseObject(overview.clientResult)?.all)?.receivedDate ? "Saved private results" : "Unsaved — defaults from TABLE A" },
    { Field: "Description", Value: target.description ?? "" },
    { Field: "Revision", Value: revision.revisionNumber ?? "" },
    { Field: "As Of", Value: overview.asOf ?? "" },
    { Field: "Period From", Value: revision.from ?? "" },
    { Field: "Period To", Value: revision.to ?? "" },
    { Field: "Period provenance", Value: revision.sourceValidityVerified === true ? "Verified Configure Collection Source validity" : "Legacy saved period; configured source validity unverified" },
    { Field: "Source Snapshots", Value: sourceLabels },
    { Field: "Aging Scope", Value: exportTextList(revision.agingScope).join(", ") },
    { Field: "Export From", Value: filters.from ?? "" },
    { Field: "Export To", Value: filters.to ?? "" },
    { Field: "Aging Filter", Value: filters.aging ?? "All scoped aging buckets" },
    { Field: "Calendar Rows", Value: calendar.length },
    { Field: "Balance Formula", Value: "Target OSP minus closed OSP; negative balances are retained" },
    { Field: "Spreadsheet Precision", Value: "Financial cells are numeric OOXML decimal values. Excel calculations use up to 15 significant digits; use CSV for exact large-amount text interchange." },
    { Field: "Dataset Completeness", Value: "Complete" },
    { Field: "Generated By", Value: dataset.generatedBy ?? "" },
    { Field: "Generated At", Value: dataset.generatedAt ?? "" },
  ];
}

function buildExportSections(dataset: Record<string, unknown>): ExportSection[] {
  const overview = ensureLooseObject(dataset.overview) ?? {};
  const calendar = flattenRows(dataset.calendar);
  const drilldown = flattenRows(dataset.drilldown);
  assertCompleteDetailRows(drilldown, dataset.drilldownTotal, "drilldown");
  const latestComparison = ensureLooseObject(overview.latestComparison);
  if (!latestComparison) throw new Error("Billing Principal export is missing the latest total comparison.");
  const system = ensureLooseObject(latestComparison.system) ?? {};
  const client = ensureLooseObject(latestComparison.client);
  const comparison = [{
    systemAsOf: system.asOf ?? "",
    systemTotalOsp: system.totalOsp ?? "",
    systemOspClosed: system.ospClosed ?? "",
    systemResultPercentage: system.resultPercentage ?? "",
    clientLastUpdatedAt: client?.lastUpdatedAt ?? "",
    clientTotalOsp: client?.totalOsp ?? "",
    clientOspClosed: client?.ospClosed ?? "",
    clientResultPercentage: client?.resultPercentage ?? "",
    differencePercentagePoints: latestComparison.differencePercentagePoints ?? "",
  }];
  const filters = ensureLooseObject(dataset.filters);
  const from = normalizeCollectionText(filters?.from);
  const to = normalizeCollectionText(filters?.to);
  if (isValidCollectionDate(from) && isValidCollectionDate(to) && calendar.length !== countDays(from, to)) {
    throw new Error(
      `Billing Principal export is missing calendar rows (${calendar.length.toLocaleString("en-MY")} of ${countDays(from, to).toLocaleString("en-MY")}).`,
    );
  }
  return [
    ["TABLE A - SYSTEM RESULT", projectExportRows(flattenSummaryRows(overview.systemResult, "Table A"), SYSTEM_RESULT_EXPORT_COLUMNS)],
    ["TABLE B - CLIENT RESULT", projectExportRows(flattenSummaryRows(overview.clientResult, "Table B"), CLIENT_RESULT_EXPORT_COLUMNS)],
    ["LATEST TOTAL COMPARISON", projectExportRows(comparison, COMPARISON_EXPORT_COLUMNS)],
    ["SYSTEM DAILY MOVEMENT", projectExportRows(calendar, CALENDAR_EXPORT_COLUMNS)],
  ];
}

function csvEscape(value: unknown, field = ""): string {
  const cell = safeSpreadsheetCell(value, field);
  const safe = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildCsvExport(dataset: Record<string, unknown>): Buffer {
  const output: string[] = ["SQR Billing OSP V3 Export"];
  for (const row of buildExportMetadata(dataset)) {
    output.push(`${csvEscape(row.Field)},${csvEscape(row.Value, String(row.Field))}`);
  }
  const sections = buildExportSections(dataset);
  for (const [name, rows] of sections) {
    output.push("", name);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    if (headers.length === 0) {
      output.push("No data");
      continue;
    }
    output.push(headers.map((header) => csvEscape(header)).join(","));
    for (const row of rows) output.push(headers.map((header) => csvEscape(row[header], header)).join(","));
  }
  return Buffer.from(`\uFEFF${output.join("\r\n")}`, "utf8");
}

async function buildXlsxExport(dataset: Record<string, unknown>): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sanitizeRows = (rows: Array<Record<string, unknown>>) => rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, safeSpreadsheetCell(value, key)]),
  ));
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(sanitizeRows(buildExportMetadata(dataset))),
    "Summary",
  );
  const sections = buildExportSections(dataset);
  const sheets: Array<[string, Array<Record<string, unknown>>]> = [
    ["Table A System", sections[0]![1]],
    ["Table B Client", sections[1]![1]],
    ["Latest Comparison", sections[2]![1]],
    ["Daily Movement", sections[3]![1]],
  ];
  for (const [name, rows] of sheets) {
    const sanitized = sanitizeRows(rows);
    const sheet = XLSX.utils.json_to_sheet(sanitized.length > 0 ? sanitized : [{ Status: "No data" }]);
    const headers = rows.length ? Object.keys(rows[0]!) : [];
    rows.forEach((row, index) => headers.forEach((field, column) => {
      const raw = String(row[field] ?? "");
      if (NUMERIC_EXPORT_FIELD.test(field) && /^-?\d+(?:\.\d+)?$/.test(raw)) {
        // Store the exact decimal in a numeric OOXML cell, without coercing its
        // value through a binary JS Number. Spreadsheet applications still have
        // their own documented calculation precision (declared in Summary).
        sheet[XLSX.utils.encode_cell({ r: index + 1, c: column })] = { t: "n", v: raw, z: /Count|Accounts/.test(field) ? "0" : "#,##0.00##;[Red]-#,##0.00##" };
      }
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as unknown;
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof Uint8Array) return Buffer.from(output);
  throw new Error("Excel export did not produce a binary workbook.");
}

export class CollectionOspV7Operations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
    private readonly exportGuard: CollectionOspV7ExportGuard = createCollectionOspV7ExportGuard(),
  ) {}

  private targetIsVisible(target: CollectionOspSavedTargetView, user: AuthenticatedUser): boolean {
    if (target.status !== "ACTIVE") return false;
    const viewer = viewerScope(user);
    return viewer.role === "superuser" || viewer.role === "manager"
      || target.assignedAdminUserId === viewer.userId;
  }

  private async requireVisibleTarget(
    user: AuthenticatedUser,
    targetId: string,
    revisionId?: string,
  ): Promise<CollectionOspSavedTargetView> {
    const target = await this.storage.getCollectionOspSavedTarget(targetId, revisionId, viewerScope(user));
    if (!target || !this.targetIsVisible(target, user)) {
      throw notFound("Saved Target was not found.", "COLLECTION_OSP_TARGET_NOT_FOUND");
    }
    return target;
  }

  async listTargets(userInput: AuthenticatedUser | undefined, query: Record<string, unknown> = {}) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const page = query.page == null ? 1 : readPositiveInteger(query.page, "Page", 10_000);
    const pageSize = query.pageSize == null ? 50 : readPositiveInteger(query.pageSize, "Page size", 50);
    const targets = await this.storage.listCollectionOspSavedTargets({ viewer: viewerScope(user), limit: pageSize + 1, offset: (page - 1) * pageSize });
    const visibleTargets = targets.filter((target) => this.targetIsVisible(target, user));
    return {
      ok: true as const,
      targets: visibleTargets.slice(0, pageSize),
      page, pageSize, hasMore: visibleTargets.length > pageSize,
    };
  }

  async targetOptions(userInput: AuthenticatedUser | undefined, query: Record<string, unknown>) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const options = await this.storage.getCollectionOspTargetOptions({
      viewer: viewerScope(user),
      sourceSearch: readBoundedText(query.sourceSearch, "Source search", 120) ?? "",
      adminSearch: readBoundedText(query.adminSearch, "Admin search", 120) ?? "",
      sourcePage: query.sourcePage == null ? 1 : readPositiveInteger(query.sourcePage, "Source page", 10_000),
      adminPage: query.adminPage == null ? 1 : readPositiveInteger(query.adminPage, "Admin page", 10_000),
      pageSize: query.pageSize == null ? 50 : readPositiveInteger(query.pageSize, "Page size", 100),
    });
    return { ok: true as const, ...options };
  }

  async previewSource(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const body = ensureLooseObject(bodyRaw) ?? {};
    const sourceImportIds = readStringList(body.sourceImportIds, 5, 200);
    if (sourceImportIds.length === 0) throw badRequest("Select a configured Saved source.");
    try {
      const preview = await this.storage.previewCollectionOspSourceScope({ viewer: viewerScope(user), sourceImportIds });
      return { ok: true as const, ...preview };
    } catch (error) { normalizeRepositoryError(error); }
  }

  async getTarget(userInput: AuthenticatedUser | undefined, targetIdRaw: unknown) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const targetId = readUuid(targetIdRaw, "Saved Target ID");
    const target = await this.requireVisibleTarget(user, targetId);
    return { ok: true as const, target, viewerUserId: viewerScope(user).userId };
  }

  async createTarget(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const body = ensureLooseObject(bodyRaw) ?? {};
    const name = readBoundedText(body.name, "Target name", 120, { required: true })!;
    const assignedAdminUserId = readBoundedText(body.assignedAdminUserId, "Assigned admin account", 200, { required: true })!;
    const description = readBoundedText(body.description, "Description", 1_000);
    const sourceImportIds = readStringList(body.sourceImportIds, 5, 200);
    if (sourceImportIds.length < 1) throw badRequest("Select between 1 and 5 Saved source files.");
    const from = body.from == null ? undefined : readDate(body.from, "Period From");
    const to = body.to == null ? undefined : readDate(body.to, "Period To");
    if (from && to && from > to) throw badRequest("Period To cannot be earlier than Period From.");
    const trackingStartDate = body.trackingStartDate == null ? undefined : readDate(body.trackingStartDate, "Tracking start date");
    const trackingEndDate = body.trackingEndDate == null || !normalizeCollectionText(body.trackingEndDate)
      ? undefined
      : readDate(body.trackingEndDate, "Tracking end date");
    const nicknameScope = readStringList(body.nicknameScope, 100, 120);
    if (nicknameScope.length > 0) throw badRequest("Saved Billing targets use configured sources and account assignment, not nickname filters.");
    const agingScopeRaw = readStringList(body.agingScope, 4, 3);
    const requestedAgings = agingScopeRaw.length === 0 ? AGINGS : agingScopeRaw.map((aging) => readAging(aging)!);
    if (new Set(requestedAgings).size !== requestedAgings.length) {
      throw badRequest("Aging scope must contain unique D3, D4, D5, or D6 values.");
    }
    if (
      requestedAgings.length !== AGINGS.length
      || AGINGS.some((aging) => !requestedAgings.includes(aging))
    ) {
      throw badRequest("A Saved Target must include the complete D3, D4, D5, and D6 aging scope.");
    }
    const agingScope = [...AGINGS];
    try {
      const target = await this.storage.createCollectionOspSavedTarget({
        name,
        assignedAdminUserId,
        viewer: viewerScope(user),
        description,
        sourceImportIds,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(trackingStartDate === undefined ? {} : { trackingStartDate }),
        ...(trackingEndDate === undefined ? {} : { trackingEndDate }),
        timezone: "Asia/Kuala_Lumpur",
        nicknameScope,
        agingScope,
        targets: readTargetRows(body.targets, agingScope),
        actor: user.username,
      });
      return { ok: true as const, target };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async updateTarget(userInput: AuthenticatedUser | undefined, targetIdRaw: unknown, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const body = ensureLooseObject(bodyRaw) ?? {};
    if (Object.keys(body).some((key) => !["name", "description", "assignedAdminUserId", "targets", "version"].includes(key))) {
      throw badRequest("Only target name, description, assigned admin and shared target percentages can be edited. Source snapshots are immutable.");
    }
    const targetId = readUuid(targetIdRaw, "Saved Target ID");
    const name = body.name === undefined ? undefined : readBoundedText(body.name, "Target name", 120, { required: true })!;
    const description = body.description === undefined ? undefined : readBoundedText(body.description, "Description", 1_000);
    const assignedAdminUserId = body.assignedAdminUserId === undefined ? undefined
      : readBoundedText(body.assignedAdminUserId, "Assigned admin account", 200, { required: true })!;
    const targets = body.targets === undefined ? undefined : readTargetRows(body.targets, AGINGS);
    if (name === undefined && description === undefined && assignedAdminUserId === undefined && targets === undefined) {
      throw badRequest("Provide a name, assigned admin or shared target percentage update.");
    }
    const expectedVersion = readPositiveInteger(body.version, "Version", 2_147_483_647);
    try {
      const target = await this.storage.updateCollectionOspSavedTarget({
        targetId,
        viewer: viewerScope(user),
        ...(assignedAdminUserId === undefined ? {} : { assignedAdminUserId }),
        ...(targets === undefined ? {} : { targets }),
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description }),
        expectedVersion,
        actor: user.username,
      });
      return { ok: true as const, target };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async deleteTarget(userInput: AuthenticatedUser | undefined, targetIdRaw: unknown, versionRaw?: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const targetId = readUuid(targetIdRaw, "Saved Target ID");
    const expectedVersion = readPositiveInteger(versionRaw, "Version", 2_147_483_647);
    try {
      const target = await this.storage.deleteCollectionOspSavedTarget({
        targetId,
        viewer: viewerScope(user),
        expectedVersion,
        actor: user.username,
      });
      return { ok: true as const, target };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async overview(userInput: AuthenticatedUser | undefined, targetRaw: unknown, revisionRaw: unknown, query: Record<string, unknown>) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const targetId = readUuid(targetRaw, "Saved Target ID");
    const revisionId = readUuid(revisionRaw, "Target revision ID");
    const target = await this.requireVisibleTarget(user, targetId, revisionId);
    try {
      const overview = await this.storage.getCollectionOspTargetOverview({
        viewer: viewerScope(user),
        targetId,
        revisionId,
        asOfDate: query.asOf == null ? defaultTargetAsOf(target) : readDate(query.asOf, "As-of date"),
      });
      return { ok: true as const, ...(overview as Record<string, unknown>) };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async upsertClientResults(userInput: AuthenticatedUser | undefined, targetRaw: unknown, revisionRaw: unknown, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const body = ensureLooseObject(bodyRaw) ?? {};
    for (const key of Object.keys(body)) {
      if (key !== "rows") throw badRequest("Client Result contains an unsupported or ownership field.");
    }
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 4) {
      throw badRequest("Client Result must contain between one and four unique aging rows.");
    }
    const seen = new Set<string>();
    const rows = body.rows.map((raw) => {
      const row = ensureLooseObject(raw);
      if (!row) throw badRequest("Client Result row is invalid.");
      if (Object.keys(row).some((key) => !["aging", "targetPercentage", "resultPercentage", "note", "reference", "version"].includes(key))) {
        throw badRequest("Client Result contains an unsupported or server-derived field.");
      }
      const aging = readAging(row.aging)!;
      if (seen.has(aging)) throw badRequest("Client Result aging rows must be unique.");
      seen.add(aging);
      return {
        aging,
        targetPercentage: readPercentage(row.targetPercentage, `${aging} private Target`),
        resultPercentage: readPercentage(row.resultPercentage, `${aging} Client Result`),
        note: readBoundedText(row.note, "Client note", 2_000),
        reference: readBoundedText(row.reference, "Client reference", 300),
        ...(row.version == null ? {} : { expectedVersion: readPositiveInteger(row.version, "Client Result version", 2_147_483_647) }),
      };
    });
    try {
      const targetId = readUuid(targetRaw, "Saved Target ID");
      const revisionId = readUuid(revisionRaw, "Target revision ID");
      const target = await this.requireVisibleTarget(user, targetId, revisionId);
      const clientResult = await this.storage.upsertCollectionOspClientResults({
        viewer: viewerScope(user),
        targetId,
        revisionId,
        receivedDate: currentBusinessDate(),
        rows,
        actor: user.username,
      });
      const range = targetTrackingRange(target);
      const today = currentBusinessDate();
      const latestAsOf = today < range.start ? range.start : today > range.end ? range.end : today;
      const overview = await this.storage.getCollectionOspTargetOverview({
        viewer: viewerScope(user),
        targetId,
        revisionId,
        asOfDate: latestAsOf,
      }) as Record<string, unknown>;
      return {
        ok: true as const,
        clientResult,
        latestComparison: overview.latestComparison,
      };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async calendar(userInput: AuthenticatedUser | undefined, targetRaw: unknown, revisionRaw: unknown, query: Record<string, unknown>) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const targetId = readUuid(targetRaw, "Saved Target ID");
    const revisionId = readUuid(revisionRaw, "Target revision ID");
    const target = await this.requireVisibleTarget(user, targetId, revisionId);
    const from = readDate(target.activeRevision.from, "Configured source Valid From");
    const to = readDate(target.activeRevision.to, "Configured source Valid Until");
    if (from > to || countDays(from, to) > 366) throw badRequest("Calendar range must be between 1 and 366 days.");
    // Calendar always covers source validity, independently of historical Table A.
    const asOfDate = to;
    const aging = readAging(query.aging, true);
    if (aging && !target.activeRevision.agingScope.includes(aging)) {
      throw badRequest("Aging is outside this Saved Target revision.");
    }
    try {
      const calendar = await this.storage.getCollectionOspCalendar({
        viewer: viewerScope(user),
        targetId,
        revisionId,
        from,
        to,
        asOfDate,
        ...(aging ? { aging } : {}),
      });
      return { ok: true as const, ...calendar };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async drilldown(userInput: AuthenticatedUser | undefined, targetRaw: unknown, revisionRaw: unknown, query: Record<string, unknown>) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const targetId = readUuid(targetRaw, "Saved Target ID");
    const revisionId = readUuid(revisionRaw, "Target revision ID");
    const target = await this.requireVisibleTarget(user, targetId, revisionId);
    const page = readPagination(query);
    const aging = readAging(query.aging, true);
    const date = query.date == null ? undefined : readDate(query.date, "Drilldown date");
    const requestedAsOf = query.asOf == null ? defaultTargetAsOf(target) : readDate(query.asOf, "As-of date");
    const asOfDate = date ? target.activeRevision.to : requestedAsOf;
    try {
      const result = await this.storage.getCollectionOspDrilldown({
        viewer: viewerScope(user),
        targetId,
        revisionId,
        asOfDate,
        ...(date === undefined ? {} : { date }),
        ...(aging ? { aging } : {}),
        ...page,
      });
      return { ok: true as const, ...result };
    } catch (error) {
      normalizeRepositoryError(error);
    }
  }

  async exportReport(userInput: AuthenticatedUser | undefined, targetRaw: unknown, revisionRaw: unknown, query: Record<string, unknown>) {
    const user = this.requireUser(userInput);
    requireReportViewer(user);
    const targetId = readUuid(targetRaw, "Saved Target ID");
    const revisionId = readUuid(revisionRaw, "Target revision ID");
    const target = await this.requireVisibleTarget(user, targetId, revisionId);
    const format = normalizeCollectionText(query.format).toLowerCase();
    if (format !== "csv" && format !== "xlsx" && format !== "json") {
      throw badRequest("Export format must be CSV, Excel XLSX, or governed visual JSON.");
    }
    const asOfDate = query.asOf == null ? defaultTargetAsOf(target) : readDate(query.asOf, "As-of date");
    const from = query.from == null ? target.activeRevision.from : readDate(query.from, "Export From");
    const to = query.to == null ? target.activeRevision.to : readDate(query.to, "Export To");
    if (from > to || countDays(from, to) > 366) throw badRequest("Export date range must be between 1 and 366 days.");
    const exportDate = query.date == null ? undefined : readDate(query.date, "Export date");
    if (exportDate && exportDate > asOfDate) throw badRequest("Export date cannot be later than the as-of date.");
    const aging = readAging(query.aging, true);
    try {
      return await this.exportGuard.run(user.username, async () => {
        const dataset = await this.storage.getCollectionOspExportDataset({
          viewer: viewerScope(user),
          targetId,
          revisionId,
          asOfDate,
          from,
          to,
          ...(exportDate === undefined ? {} : { date: exportDate }),
          ...(aging ? { aging } : {}),
        });
        const governedDataset = { ...dataset, drilldown: [], drilldownTotal: 0,
          generatedBy: user.username, generatedByUserId: viewerScope(user).userId };
        assertCollectionOspV7ExportWithinLimits(governedDataset);
        const buffer = format === "xlsx"
          ? await buildXlsxExport(governedDataset)
          : format === "json"
            ? Buffer.from(JSON.stringify({ ok: true, ...governedDataset }), "utf8")
            : buildCsvExport(governedDataset);
        const currentTarget = await this.requireVisibleTarget(user, targetId, revisionId);
        const exportedTarget = ensureLooseObject(ensureLooseObject(dataset.overview)?.target);
        if (currentTarget.version !== exportedTarget?.version) {
          throw conflict("Saved Target changed while exporting. Reload and export again.");
        }
        return {
          buffer,
          generatedByUserId: viewerScope(user).userId,
          contentType: format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : format === "json"
              ? "application/json; charset=utf-8"
              : "text/csv; charset=utf-8",
          filename: `billing-osp-v3-${asOfDate}.${format}`,
        };
      });
    } catch (error) {
      if (error instanceof CollectionOspV7ExportGuardError) {
        throw new HttpError(error.statusCode, error.message);
      }
      normalizeRepositoryError(error);
    }
  }

}
