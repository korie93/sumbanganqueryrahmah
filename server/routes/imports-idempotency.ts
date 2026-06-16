import type { NextFunction, RequestHandler, Response } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import type { AuthenticatedRequest } from "../auth/guards";
import { badRequest } from "../http/errors";
import { logger } from "../lib/logger";
import { safeJsonParse } from "../lib/safe-json";
import type { PostgresStorage } from "../storage-postgres";

type ImportMutationIdempotencyStorage = Pick<
  PostgresStorage,
  "acquireMutationIdempotency" | "completeMutationIdempotency" | "releaseMutationIdempotency"
>;

type ImportMutationReservation = {
  actor: string;
  idempotencyKey: string;
  scope: string;
  state: "pending" | "completed" | "released";
  releasePromise?: Promise<void> | undefined;
  storage: ImportMutationIdempotencyStorage;
};

type ImportMutationResponseLocals = Record<string, unknown> & {
  importMutationReservation?: ImportMutationReservation | undefined;
};

const IMPORT_CREATE_IDEMPOTENCY_SCOPE = "imports:create";
const IDEMPOTENCY_HEADER_MAX_LENGTH = 512;

function normalizeIdempotencyHeader(value: unknown, label: string): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > IDEMPOTENCY_HEADER_MAX_LENGTH) {
    throw badRequest(`${label} exceeds the ${IDEMPOTENCY_HEADER_MAX_LENGTH}-character limit.`);
  }
  return normalized;
}

function normalizeIdempotencyFingerprint(value: unknown): string | null {
  const normalized = normalizeIdempotencyHeader(value, "Idempotency fingerprint");
  if (!normalized) {
    return null;
  }

  const parseResult = safeJsonParse<unknown>(normalized, "import_idempotency_fingerprint", {
    maxRawBytes: IDEMPOTENCY_HEADER_MAX_LENGTH,
  });
  if (!parseResult.success) {
    throw badRequest("Idempotency fingerprint must be valid JSON.");
  }

  return normalized;
}

function getResponseLocals(res: Response): ImportMutationResponseLocals {
  return res.locals as ImportMutationResponseLocals;
}

async function releaseReservation(reservation: ImportMutationReservation): Promise<void> {
  if (reservation.state !== "pending") {
    return;
  }
  if (reservation.releasePromise) {
    return reservation.releasePromise;
  }

  reservation.releasePromise = reservation.storage.releaseMutationIdempotency({
    scope: reservation.scope,
    actor: reservation.actor,
    idempotencyKey: reservation.idempotencyKey,
  });

  try {
    await reservation.releasePromise;
    reservation.state = "released";
  } finally {
    reservation.releasePromise = undefined;
  }
}

function sendIdempotencyConflict(
  res: Response,
  code: typeof ERROR_CODES.IDEMPOTENCY_KEY_IN_PROGRESS
    | typeof ERROR_CODES.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
  message: string,
) {
  return res.status(409).json({
    ok: false,
    message,
    code,
    error: {
      code,
      message,
    },
  });
}

export function createImportMutationIdempotencyMiddleware(
  storage: ImportMutationIdempotencyStorage,
): RequestHandler {
  return async (req, res, next: NextFunction) => {
    try {
      const authenticatedRequest = req as AuthenticatedRequest;
      const actor = String(authenticatedRequest.user?.username || "").trim();
      const idempotencyKey = normalizeIdempotencyHeader(
        authenticatedRequest.header("x-idempotency-key"),
        "Idempotency key",
      );
      const requestFingerprint = normalizeIdempotencyFingerprint(
        authenticatedRequest.header("x-idempotency-fingerprint"),
      );

      if (!actor || !idempotencyKey) {
        next();
        return;
      }
      if (!requestFingerprint) {
        throw badRequest("Idempotency fingerprint is required when an idempotency key is provided.");
      }

      const reservationResult = await storage.acquireMutationIdempotency({
        scope: IMPORT_CREATE_IDEMPOTENCY_SCOPE,
        actor,
        idempotencyKey,
        requestFingerprint,
      });

      if (reservationResult.status === "replay") {
        res.status(reservationResult.responseStatus).json(reservationResult.responseBody);
        return;
      }

      if (reservationResult.status === "payload_mismatch") {
        sendIdempotencyConflict(
          res,
          ERROR_CODES.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
          "This request key was already used for a different import file.",
        );
        return;
      }

      if (reservationResult.status === "in_progress") {
        sendIdempotencyConflict(
          res,
          ERROR_CODES.IDEMPOTENCY_KEY_IN_PROGRESS,
          "A matching import is still being processed. Please wait before retrying.",
        );
        return;
      }

      const reservation: ImportMutationReservation = {
        actor,
        idempotencyKey,
        scope: IMPORT_CREATE_IDEMPOTENCY_SCOPE,
        state: "pending",
        storage,
      };
      getResponseLocals(res).importMutationReservation = reservation;

      const releasePendingReservation = () => {
        void releaseReservation(reservation).catch((error: unknown) => {
          logger.warn("Failed to release import mutation idempotency reservation", {
            event: "import_idempotency_release_failed",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        });
      };
      res.once("finish", releasePendingReservation);
      res.once("close", releasePendingReservation);

      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function completeImportMutationIdempotency(
  res: Response,
  responseBody: unknown,
  responseStatus = 200,
): Promise<void> {
  const reservation = getResponseLocals(res).importMutationReservation;
  if (!reservation || reservation.state !== "pending") {
    return;
  }

  try {
    await reservation.storage.completeMutationIdempotency({
      scope: reservation.scope,
      actor: reservation.actor,
      idempotencyKey: reservation.idempotencyKey,
      responseStatus,
      responseBody,
    });
    reservation.state = "completed";
  } catch (error) {
    logger.warn("Failed to persist import mutation idempotency response", {
      event: "import_idempotency_complete_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    try {
      await releaseReservation(reservation);
    } catch (releaseError) {
      logger.warn("Failed to release import mutation idempotency reservation after persist failure", {
        event: "import_idempotency_release_failed",
        message: releaseError instanceof Error ? releaseError.message : "Unknown error",
      });
    }
  }
}

export async function releaseImportMutationIdempotency(res: Response): Promise<void> {
  const reservation = getResponseLocals(res).importMutationReservation;
  if (!reservation) {
    return;
  }

  try {
    await releaseReservation(reservation);
  } catch (error) {
    logger.warn("Failed to release import mutation idempotency reservation", {
      event: "import_idempotency_release_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
