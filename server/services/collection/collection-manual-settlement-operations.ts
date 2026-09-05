import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../../http/errors";
import { getRequestIdFromContext } from "../../lib/request-context";
import {
  formatCollectionAmountFromCents,
  parseCollectionAmountToCents,
} from "../../../shared/collection-amount-types";
import type { CollectionManualSettlementReason } from "../../storage-postgres-collection-types";
import {
  ensureLooseObject,
  isFutureCollectionDate,
  isValidCollectionDate,
  normalizeCollectionText,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  getAccessibleCollectionRecordOrThrow,
  requireCollectionRecordId,
  type RequireUserFn,
} from "./collection-record-write-shared";

const MANUAL_SETTLEMENT_REASONS = new Set<CollectionManualSettlementReason>([
  "EXTERNAL_UNASSIGNED_PAYMENT",
  "CLIENT_CONFIRMED_PAYMENT",
  "HISTORICAL_PAYMENT_NOT_CAPTURED",
  "OTHER_WITH_REQUIRED_NOTE",
]);

const COLLECTION_RECORD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireSuperuser(user: AuthenticatedUser): void {
  if (user.role !== "superuser") {
    throw forbidden("Manual Verified ABORT hanya boleh diubah oleh superuser.");
  }
}

function requireManualSettlementRecordId(value: unknown): string {
  const recordId = requireCollectionRecordId(value);
  if (!COLLECTION_RECORD_UUID_PATTERN.test(recordId)) {
    throw badRequest("Collection id tidak sah.");
  }
  return recordId;
}

function containsDisallowedControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint >= 0 && codePoint <= 8)
      || codePoint === 11
      || codePoint === 12
      || (codePoint >= 14 && codePoint <= 31)
      || codePoint === 127;
  });
}

function readBoundedOptionalText(value: unknown, maximum: number, label: string): string | null {
  const normalized = normalizeCollectionText(value);
  if (!normalized) return null;
  if (normalized.length > maximum || containsDisallowedControlCharacter(normalized)) {
    throw badRequest(`${label} tidak sah atau melebihi ${maximum} aksara.`);
  }
  return normalized;
}

function readExpectedVersion(value: unknown, options?: { required?: boolean }): number | null {
  if (value === null || value === undefined || value === "") {
    if (options?.required) throw badRequest("Versi Manual Verified ABORT diperlukan.");
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw badRequest("Versi Manual Verified ABORT tidak sah.");
  }
  return parsed;
}

function mapManualSettlementRepositoryError(error: unknown): never {
  const message = String((error as { message?: unknown })?.message ?? "");
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT")) {
    throw conflict(
      "Manual Verified ABORT telah berubah. Muat semula rekod dan cuba lagi.",
      "COLLECTION_MANUAL_SETTLEMENT_VERSION_CONFLICT",
    );
  }
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_DUPLICATE")) {
    throw conflict(
      "Akaun dan kitaran ini sudah mempunyai POOL aktif.",
      "COLLECTION_MANUAL_SETTLEMENT_DUPLICATE",
    );
  }
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_ALREADY_AUTOMATIC")) {
    throw conflict("Akaun ini sudah mencapai ABORT CP secara automatik; POOL tidak diperlukan.");
  }
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_NOT_ACTIVE")) {
    throw conflict("Manual Verified ABORT ini tidak lagi aktif.");
  }
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_INSUFFICIENT")) {
    throw new HttpError(422, "Jumlah collection sistem dan POOL masih kurang daripada TOTAL DUE.");
  }
  if (message.includes("COLLECTION_MANUAL_SETTLEMENT_DATE_INVALID")) {
    throw badRequest("Tarikh penyelesaian mesti berada dalam tempoh Calling Date sumber tersimpan.");
  }
  if (
    message.includes("COLLECTION_MANUAL_SETTLEMENT_SOURCE_INVALID")
    || message.includes("COLLECTION_MANUAL_SETTLEMENT_AMOUNT_INVALID")
  ) {
    throw badRequest("Rekod tidak mempunyai padanan sumber dan nilai TOTAL DUE yang sah untuk pengesahan manual.");
  }
  if (
    message.includes("idx_collection_records_sole_active_manual_settlement_per_cycle")
    || message.includes("duplicate key")
  ) {
    throw conflict(
      "Akaun dan kitaran ini sudah mempunyai POOL aktif.",
      "COLLECTION_MANUAL_SETTLEMENT_DUPLICATE",
    );
  }
  throw error;
}

export class CollectionManualSettlementOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async upsert(
    userInput: AuthenticatedUser | undefined,
    recordIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const recordId = requireManualSettlementRecordId(recordIdRaw);
    const body = ensureLooseObject(bodyRaw);
    if (!body) throw badRequest("Payload Manual Verified ABORT tidak sah.");
    if (body.confirmed !== true) {
      throw badRequest("Pengesahan eksplisit diperlukan untuk Manual Verified ABORT.");
    }
    const poolAmountCents = parseCollectionAmountToCents(body.poolAmount, { allowZero: false });
    if (poolAmountCents === null) {
      throw badRequest("Nilai POOL mesti amaun MYR positif dengan maksimum dua tempat perpuluhan.");
    }
    const settlementDate = normalizeCollectionText(body.settlementDate);
    if (!isValidCollectionDate(settlementDate) || isFutureCollectionDate(settlementDate)) {
      throw badRequest("Tarikh penyelesaian tidak sah atau berada pada masa hadapan.");
    }
    const reasonRaw = normalizeCollectionText(body.reason).toUpperCase();
    if (!MANUAL_SETTLEMENT_REASONS.has(reasonRaw as CollectionManualSettlementReason)) {
      throw badRequest("Sebab Manual Verified ABORT tidak sah.");
    }
    const reason = reasonRaw as CollectionManualSettlementReason;
    const note = readBoundedOptionalText(body.note, 2000, "Nota");
    const reference = readBoundedOptionalText(body.reference, 200, "Rujukan");
    if (reason === "OTHER_WITH_REQUIRED_NOTE" && !note) {
      throw badRequest("Nota diperlukan apabila sebab Other dipilih.");
    }
    const existing = await getAccessibleCollectionRecordOrThrow(this.storage, user, recordId);
    const expectedVersion = readExpectedVersion(body.expectedVersion);
    if (existing.manualSettlement && expectedVersion === null) {
      throw badRequest("Versi Manual Verified ABORT diperlukan untuk kemas kini atau pengesahan semula.");
    }

    try {
      const record = await this.storage.upsertCollectionManualSettlement({
        recordId,
        poolAmount: formatCollectionAmountFromCents(poolAmountCents),
        settlementDate,
        reason,
        note,
        reference,
        expectedVersion,
        actor: user.username,
        actorRole: user.role,
        requestId: getRequestIdFromContext(),
      });
      if (!record) throw notFound("Collection record not found.");
      return { ok: true as const, record };
    } catch (error) {
      mapManualSettlementRepositoryError(error);
    }
  }

  async revoke(
    userInput: AuthenticatedUser | undefined,
    recordIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    requireSuperuser(user);
    const recordId = requireManualSettlementRecordId(recordIdRaw);
    const body = ensureLooseObject(bodyRaw);
    if (!body || body.confirmed !== true) {
      throw badRequest("Pengesahan eksplisit diperlukan untuk membatalkan Manual Verified ABORT.");
    }
    await getAccessibleCollectionRecordOrThrow(this.storage, user, recordId);
    const expectedVersion = readExpectedVersion(body.expectedVersion, { required: true });
    const revokeReason = readBoundedOptionalText(body.revokeReason, 500, "Sebab pembatalan");
    if (!revokeReason || expectedVersion === null) {
      throw badRequest("Versi dan sebab pembatalan diperlukan.");
    }
    try {
      const record = await this.storage.revokeCollectionManualSettlement({
        recordId,
        expectedVersion,
        revokeReason,
        actor: user.username,
        actorRole: user.role,
        requestId: getRequestIdFromContext(),
      });
      if (!record) throw notFound("Collection record not found.");
      return { ok: true as const, record };
    } catch (error) {
      mapManualSettlementRepositoryError(error);
    }
  }

  async history(
    userInput: AuthenticatedUser | undefined,
    recordIdRaw: unknown,
    limitRaw?: unknown,
  ) {
    const user = this.requireUser(userInput);
    const recordId = requireManualSettlementRecordId(recordIdRaw);
    await getAccessibleCollectionRecordOrThrow(this.storage, user, recordId);
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, Math.floor(parsedLimit)))
      : 50;
    const history = await this.storage.listCollectionManualSettlementAudit(recordId, limit);
    return {
      ok: true as const,
      history: user.role === "superuser"
        ? history
        : history.map((entry) => ({
            ...entry,
            requestId: null,
            oldValue: null,
            newValue: null,
          })),
    };
  }
}
