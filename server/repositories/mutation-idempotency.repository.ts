import crypto from "node:crypto";
import { and, eq, lt, or } from "drizzle-orm";
import { mutationIdempotencyKeys } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import type {
  MutationIdempotencyAcquireInput,
  MutationIdempotencyAcquireResult,
  MutationIdempotencyCompleteInput,
} from "../storage-postgres";

const PENDING_ROW_TTL_MS = 15 * 60 * 1000;
const COMPLETED_ROW_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeRequiredValue(value: unknown): string {
  return String(value || "").trim();
}

function normalizeOptionalValue(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export class MutationIdempotencyRepository {
  async acquire(
    params: MutationIdempotencyAcquireInput,
  ): Promise<MutationIdempotencyAcquireResult> {
    const scope = normalizeRequiredValue(params.scope);
    const actor = normalizeRequiredValue(params.actor);
    const idempotencyKey = normalizeRequiredValue(params.idempotencyKey);
    const requestFingerprint = normalizeOptionalValue(params.requestFingerprint);

    if (!scope || !actor || !idempotencyKey) {
      return { status: "acquired" };
    }

    await this.pruneExpiredRows();

    const inserted = await db
      .insert(mutationIdempotencyKeys)
      .values({
        id: crypto.randomUUID(),
        scope,
        actor,
        idempotencyKey,
        requestFingerprint,
        state: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({
        id: mutationIdempotencyKeys.id,
      });

    if (inserted.length > 0) {
      return { status: "acquired" };
    }

    const existingRows = await db
      .select()
      .from(mutationIdempotencyKeys)
      .where(
        and(
          eq(mutationIdempotencyKeys.scope, scope),
          eq(mutationIdempotencyKeys.actor, actor),
          eq(mutationIdempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    const existing = existingRows[0];

    if (!existing) {
      return { status: "acquired" };
    }

    if (
      requestFingerprint
      && existing.requestFingerprint
      && existing.requestFingerprint !== requestFingerprint
    ) {
      return { status: "payload_mismatch" };
    }

    if (existing.state === "completed" && existing.responseStatus) {
      return {
        status: "replay",
        responseStatus: existing.responseStatus,
        responseBody: existing.responseBody,
      };
    }

    return { status: "in_progress" };
  }

  async complete(params: MutationIdempotencyCompleteInput): Promise<void> {
    const scope = normalizeRequiredValue(params.scope);
    const actor = normalizeRequiredValue(params.actor);
    const idempotencyKey = normalizeRequiredValue(params.idempotencyKey);
    if (!scope || !actor || !idempotencyKey) {
      return;
    }

    await db
      .update(mutationIdempotencyKeys)
      .set({
        state: "completed",
        responseStatus: params.responseStatus,
        responseBody: params.responseBody as Record<string, unknown> | null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mutationIdempotencyKeys.scope, scope),
          eq(mutationIdempotencyKeys.actor, actor),
          eq(mutationIdempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      );
  }

  async release(params: Pick<MutationIdempotencyAcquireInput, "scope" | "actor" | "idempotencyKey">): Promise<void> {
    const scope = normalizeRequiredValue(params.scope);
    const actor = normalizeRequiredValue(params.actor);
    const idempotencyKey = normalizeRequiredValue(params.idempotencyKey);
    if (!scope || !actor || !idempotencyKey) {
      return;
    }

    await db
      .delete(mutationIdempotencyKeys)
      .where(
        and(
          eq(mutationIdempotencyKeys.scope, scope),
          eq(mutationIdempotencyKeys.actor, actor),
          eq(mutationIdempotencyKeys.idempotencyKey, idempotencyKey),
          eq(mutationIdempotencyKeys.state, "pending"),
        ),
      );
  }

  private async pruneExpiredRows(): Promise<void> {
    const now = Date.now();
    const pendingCutoff = new Date(now - PENDING_ROW_TTL_MS);
    const completedCutoff = new Date(now - COMPLETED_ROW_TTL_MS);

    await db
      .delete(mutationIdempotencyKeys)
      .where(
        or(
          and(
            eq(mutationIdempotencyKeys.state, "pending"),
            lt(mutationIdempotencyKeys.updatedAt, pendingCutoff),
          ),
          and(
            eq(mutationIdempotencyKeys.state, "completed"),
            lt(mutationIdempotencyKeys.updatedAt, completedCutoff),
          ),
        ),
      );
  }
}
