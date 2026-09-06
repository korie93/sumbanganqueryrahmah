import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest, forbidden, notFound } from "../../http/errors";
import { logger } from "../../lib/logger";
import {
  getAdminVisibleNicknameValues,
  hasNicknameValue,
  readNicknameFiltersFromQuery,
} from "../../routes/collection-access";
import {
  COLLECTION_AGING_BUCKETS,
  COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH,
  ensureLooseObject,
  isValidCollectionDate,
  normalizeCollectionStringList,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import {
  formatCollectionAmountMyrString,
  parseCollectionAmountMyrInput,
} from "../../../shared/collection-amount-types";
import { canViewAllStaff } from "../../../shared/user-roles";
import type {
  CollectionAgingBucket,
  CollectionOspTargetInput,
  CollectionSourceConfig,
} from "../../storage-postgres-collection-types";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  assertValidCollectionDateRange,
  resolveUserOwnedCollectionRecordFilters,
} from "./collection-record-read-shared";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

const MAX_REPORT_SOURCE_FILES = 5;
const REPORT_AGINGS: CollectionAgingBucket[] = ["D3", "D4", "D5", "D6"];
const NO_VISIBLE_NICKNAME_SENTINEL = "__sqr_no_visible_collection_nickname__";
const PERCENTAGE_PATTERN = /^(?:100(?:\.0{1,4})?|(?:\d{1,2})(?:\.\d{1,4})?)$/;

type SourceConfigurationPayload = {
  validFrom?: unknown;
  validTo?: unknown;
  enabled?: unknown;
};

type BillingPrincipalTargetPayload = {
  agingBucket?: unknown;
  totalOspBaseline?: unknown;
  targetPercentage?: unknown;
};

function requireSuperuser(user: AuthenticatedUser): void {
  if (String(user.role || "").toLowerCase() !== "superuser") {
    throw forbidden("Only superuser can configure Collection matching sources and OSP targets.");
  }
}

function normalizeSourceImportId(value: unknown): string {
  const sourceImportId = normalizeCollectionText(value);
  if (!sourceImportId || sourceImportId.length > COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH) {
    throw badRequest("Saved source ID is invalid.");
  }
  return sourceImportId;
}

function readStrictBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || normalizeCollectionText(value).toLowerCase() === "true") return true;
  if (value === 0 || normalizeCollectionText(value).toLowerCase() === "false") return false;
  throw badRequest(`${field} must be true or false.`);
}

function readStringList(value: unknown): string[] {
  const pending: unknown[] = Array.isArray(value) ? value : [value];
  const values: string[] = [];
  for (const item of pending) {
    const normalized = normalizeCollectionText(item);
    if (!normalized) continue;
    values.push(...normalized.split(",").map((part) => part.trim()).filter(Boolean));
  }
  return normalizeCollectionStringList(values);
}

function readSourceImportIds(query: Record<string, unknown>): string[] {
  const values = readStringList(
    query.sourceImportIds ?? query.sourceImportId ?? query.sources,
  ).map(normalizeSourceImportId);
  if (values.length < 1 || values.length > MAX_REPORT_SOURCE_FILES) {
    throw badRequest("Select between 1 and 5 Saved source files.");
  }
  return values;
}

function readAgingBuckets(query: Record<string, unknown>): CollectionAgingBucket[] | undefined {
  const values = readStringList(query.agingBuckets ?? query.aging)
    .map((value) => value.toUpperCase());
  if (values.length === 0 || values.includes("ALL")) return undefined;
  if (values.some((value) => !COLLECTION_AGING_BUCKETS.has(value))) {
    throw badRequest("Aging filter must contain only D3, D4, D5, or D6.");
  }
  return values as CollectionAgingBucket[];
}

function formatCompatibilityIssues(issues: string[]): string {
  const labels: Record<string, string> = {
    empty_source: "source file has no rows",
    invalid_source_rows: "one or more source rows are invalid",
    missing_account_or_card: "Account No or Card No",
    invalid_account_or_card: "valid Account No or Card No values",
    missing_total_due: "Total Amount Due (TOTAL DUE)",
    invalid_total_due: "valid TOTAL DUE values",
    missing_billing_principal_osp: "Billing Principal (OSP)",
    invalid_billing_principal_osp: "valid Billing Principal (OSP) values",
    missing_dc_sts: "Delinquency Status (DC_STS)",
    invalid_dc_sts: "valid DC_STS 3, 4, 5, or 6",
    missing_calling_date: "Calling Date",
    invalid_calling_date: "valid Calling Date values",
  };
  return issues.map((issue) => labels[issue] || issue).join(", ");
}

function parseTargetPercentage(value: unknown): string {
  const normalized = normalizeCollectionText(value).replace(/%$/, "").trim();
  if (!PERCENTAGE_PATTERN.test(normalized)) {
    throw badRequest("Target percentage must be between 0 and 100 with at most 4 decimals.");
  }
  return Number(normalized).toFixed(4);
}

function parseTargetRows(value: unknown): CollectionOspTargetInput[] {
  if (!Array.isArray(value)) {
    throw badRequest("OSP targets must be an array containing D3, D4, D5, and D6.");
  }
  const seen = new Set<string>();
  const targets = value.map((raw): CollectionOspTargetInput => {
    const row = ensureLooseObject(raw) as BillingPrincipalTargetPayload | null;
    if (!row) throw badRequest("Each OSP target must be an object.");
    const agingBucket = normalizeCollectionText(row.agingBucket).toUpperCase();
    if (!COLLECTION_AGING_BUCKETS.has(agingBucket) || seen.has(agingBucket)) {
      throw badRequest("OSP target aging values must be unique D3, D4, D5, or D6 values.");
    }
    seen.add(agingBucket);
    const baselineRaw = normalizeCollectionText(row.totalOspBaseline);
    const baseline = baselineRaw
      ? parseCollectionAmountMyrInput(baselineRaw, { allowZero: true })
      : null;
    if (baselineRaw && baseline === null) {
      throw badRequest(`Total OSP baseline for ${agingBucket} is invalid.`);
    }
    return {
      agingBucket: agingBucket as CollectionAgingBucket,
      totalOspBaseline: baseline === null ? null : formatCollectionAmountMyrString(baseline),
      targetPercentage: parseTargetPercentage(row.targetPercentage),
    };
  });
  if (targets.length !== REPORT_AGINGS.length || REPORT_AGINGS.some((aging) => !seen.has(aging))) {
    throw badRequest("OSP target configuration must include D3, D4, D5, and D6 exactly once.");
  }
  return targets;
}

export class CollectionSourceGovernanceOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async listSourceConfigs(userInput: AuthenticatedUser | undefined) {
    const user = this.requireUser(userInput);
    const configs = await this.storage.listCollectionSourceConfigs();
    return {
      ok: true as const,
      sourceConfigs: user.role === "superuser"
        ? configs
        : configs.filter((config) => config.compatibilityStatus === "compatible"),
    };
  }

  async getSourceConfig(userInput: AuthenticatedUser | undefined, sourceImportIdRaw: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const sourceImportId = normalizeSourceImportId(sourceImportIdRaw);
    const config = await this.storage.getCollectionSourceConfig(sourceImportId);
    if (!config) throw notFound("Collection matching source configuration was not found.");
    return { ok: true as const, config };
  }

  async configureSource(
    userInput: AuthenticatedUser | undefined,
    sourceImportIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const sourceImportId = normalizeSourceImportId(sourceImportIdRaw);
    const body = (ensureLooseObject(bodyRaw) || {}) as SourceConfigurationPayload;
    const validFrom = normalizeCollectionText(body.validFrom);
    const validTo = normalizeCollectionText(body.validTo);
    if (!isValidCollectionDate(validFrom) || !isValidCollectionDate(validTo)) {
      throw badRequest("validFrom and validTo must be valid dates in YYYY-MM-DD format.");
    }
    if (validFrom > validTo) {
      throw badRequest("validTo cannot be earlier than validFrom.");
    }
    const enabled = readStrictBoolean(body.enabled, "enabled");
    const before = await this.storage.getCollectionSourceConfig(sourceImportId);
    const config = await this.storage.configureCollectionSource({
      sourceImportId,
      validFrom,
      validTo,
      enabled,
      configuredBy: user.username,
    });
    await this.auditSourceConfiguration(user, "COLLECTION_SOURCE_CONFIGURED", config, before);
    if (enabled && config.compatibilityStatus !== "compatible") {
      throw badRequest(
        `This Saved file cannot be activated for Collection matching: ${formatCompatibilityIssues(config.compatibilityIssues)}.`,
      );
    }
    const legacyBackfill = enabled
      ? await this.storage.backfillLegacyCollectionRecordsForSource(sourceImportId)
      : null;
    if (legacyBackfill) {
      logger.info("Collection legacy source backfill completed", {
        sourceImportId,
        scannedRecords: legacyBackfill.scannedRecords,
        backfilledRecords: legacyBackfill.backfilledRecords,
        unresolvedRecords: legacyBackfill.unresolvedRecords,
        recalculatedCycles: legacyBackfill.recalculatedCycles,
      });
      try {
        await this.storage.createAuditLog({
          action: "COLLECTION_LEGACY_SOURCE_BACKFILL",
          performedBy: user.username,
          targetResource: sourceImportId,
          details: JSON.stringify({
            event: "collection_legacy_source_backfill",
            sourceImportId,
            ...legacyBackfill,
          }),
        });
      } catch (error) {
        logger.warn("Collection legacy source backfill audit logging failed", {
          error,
          sourceImportId,
          username: user.username,
        });
      }
    }
    return { ok: true as const, config, legacyBackfill };
  }

  async deleteSourceConfig(userInput: AuthenticatedUser | undefined, sourceImportIdRaw: unknown) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const sourceImportId = normalizeSourceImportId(sourceImportIdRaw);
    const before = await this.storage.getCollectionSourceConfig(sourceImportId);
    if (!before) throw notFound("Collection matching source configuration was not found.");
    const deleted = await this.storage.deleteCollectionSource(sourceImportId);
    if (!deleted) throw notFound("Collection matching source configuration was not found.");
    await this.auditSourceConfiguration(user, "COLLECTION_SOURCE_CONFIG_DELETED", before, before);
    return { ok: true as const };
  }

  async getBillingPrincipalReport(
    userInput: AuthenticatedUser | undefined,
    queryRaw: Record<string, unknown>,
  ) {
    const user = this.requireUser(userInput);
    // Legacy unassigned-source reports are a superuser configuration tool.
    // Staff reporting must use the saved-target assignment boundary instead.
    requireSuperuser(user);
    const request = await this.normalizeReportRequest(user, queryRaw);
    const report = await this.storage.getCollectionBillingPrincipalReport(request);
    return {
      ok: true as const,
      filters: {
        sourceImportIds: request.sourceImportIds,
        from: request.from,
        to: request.to,
        agingBuckets: request.agingBuckets ?? REPORT_AGINGS,
        nicknames: request.nicknames ?? [],
      },
      report,
    };
  }

  async getBillingPrincipalTargets(
    userInput: AuthenticatedUser | undefined,
    queryRaw: Record<string, unknown>,
  ) {
    const payload = await this.getBillingPrincipalReport(userInput, queryRaw);
    return {
      ok: true as const,
      targets: payload.report.rows.map((row) => ({
        agingBucket: row.aging,
        totalOspBaseline: row.totalOsp,
        targetPercentage: row.targetPercentage,
        targetOsp: row.targetOsp,
      })),
    };
  }

  async upsertBillingPrincipalTargets(
    userInput: AuthenticatedUser | undefined,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const body = ensureLooseObject(bodyRaw) || {};
    const request = await this.normalizeReportRequest(user, body);
    const targets = parseTargetRows(body.targets);
    const persisted = await this.storage.upsertCollectionOspTargets({
      sourceImportIds: request.sourceImportIds,
      from: request.from,
      to: request.to,
      targets,
      configuredBy: user.username,
    });
    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_OSP_TARGETS_CONFIGURED",
        performedBy: user.username,
        targetResource: "collection:billing-principal-targets",
        details: JSON.stringify({
          event: "collection_osp_targets_configured",
          sourceImportIds: request.sourceImportIds,
          from: request.from,
          to: request.to,
          agingBuckets: persisted.map((target) => target.agingBucket),
        }),
      });
    } catch (error) {
      logger.warn("Collection OSP target audit logging failed", {
        error,
        username: user.username,
      });
    }
    return { ok: true as const, targets: persisted };
  }

  private async normalizeReportRequest(
    user: AuthenticatedUser,
    query: Record<string, unknown>,
  ): Promise<{
    sourceImportIds: string[];
    from: string;
    to: string;
    agingBuckets?: CollectionAgingBucket[];
    nicknames?: string[];
    createdByLogin?: string;
  }> {
    const sourceImportIds = readSourceImportIds(query);
    const from = normalizeCollectionText(query.from);
    const to = normalizeCollectionText(query.to);
    assertValidCollectionDateRange({ from, to });
    if (!from || !to) throw badRequest("Date From and Date To are required.");

    const configs = await this.storage.listCollectionSourceConfigs();
    const configById = new Map(configs.map((config) => [config.sourceImportId, config] as const));
    const invalidSource = sourceImportIds.find((sourceImportId) => {
      const config = configById.get(sourceImportId);
      return !config || config.compatibilityStatus !== "compatible";
    });
    if (invalidSource) {
      throw badRequest("One or more selected Saved sources are not configured or compatible.");
    }

    const requestedNicknames = readNicknameFiltersFromQuery(query);
    let nicknames: string[] | undefined;
    let createdByLogin: string | undefined;
    if (canViewAllStaff(user.role)) {
      for (const nickname of requestedNicknames) {
        if (!(await this.storage.isCollectionStaffNicknameActive(nickname))) {
          throw badRequest("Invalid nickname filter.");
        }
      }
      nicknames = requestedNicknames.length > 0 ? requestedNicknames : undefined;
    } else if (user.role === "admin") {
      const allowed = await getAdminVisibleNicknameValues(this.storage, user);
      if (requestedNicknames.some((nickname) => !hasNicknameValue(allowed, nickname))) {
        throw badRequest("Invalid nickname filter.");
      }
      nicknames = requestedNicknames.length > 0
        ? requestedNicknames
        : allowed.length > 0
          ? allowed
          : [NO_VISIBLE_NICKNAME_SENTINEL];
    } else {
      const owned = await resolveUserOwnedCollectionRecordFilters(this.storage, user);
      nicknames = owned.nicknames;
      createdByLogin = owned.createdByLogin;
    }

    const agingBuckets = readAgingBuckets(query);
    return {
      sourceImportIds,
      from,
      to,
      ...(agingBuckets ? { agingBuckets } : {}),
      ...(nicknames ? { nicknames } : {}),
      ...(createdByLogin ? { createdByLogin } : {}),
    };
  }

  private async auditSourceConfiguration(
    user: AuthenticatedUser,
    action: "COLLECTION_SOURCE_CONFIGURED" | "COLLECTION_SOURCE_CONFIG_DELETED",
    config: CollectionSourceConfig,
    before: CollectionSourceConfig | undefined,
  ): Promise<void> {
    try {
      await this.storage.createAuditLog({
        action,
        performedBy: user.username,
        targetResource: config.sourceImportId,
        details: JSON.stringify({
          event: action.toLowerCase(),
          sourceImportId: config.sourceImportId,
          previous: before ? {
            validFrom: before.validFrom,
            validTo: before.validTo,
            enabled: before.enabled,
          } : null,
          current: action === "COLLECTION_SOURCE_CONFIG_DELETED" ? null : {
            validFrom: config.validFrom,
            validTo: config.validTo,
            enabled: config.enabled,
            compatibilityStatus: config.compatibilityStatus,
            compatibilityIssues: config.compatibilityIssues,
            indexedRowCount: config.indexedRowCount,
          },
        }),
      });
    } catch (error) {
      logger.warn("Collection source configuration audit logging failed", {
        action,
        error,
        sourceImportId: config.sourceImportId,
        username: user.username,
      });
    }
  }
}
