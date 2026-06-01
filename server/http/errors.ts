import type { ErrorCode } from "../../shared/error-codes";

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: ErrorCode | undefined;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: ErrorCode | undefined; details?: unknown; expose?: boolean | undefined },
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
    this.expose = options?.expose ?? statusCode < 500;
  }
}

export function badRequest(message: string, code?: ErrorCode, details?: unknown) {
  return new HttpError(400, message, { code, details });
}

export function unauthorized(message = "Authentication required.", code?: ErrorCode) {
  return new HttpError(401, message, { code });
}

export function forbidden(message = "Insufficient permissions.", code?: ErrorCode) {
  return new HttpError(403, message, { code });
}

export function notFound(message = "Resource not found.", code?: ErrorCode) {
  return new HttpError(404, message, { code });
}

export function conflict(message: string, code?: ErrorCode) {
  return new HttpError(409, message, { code });
}
