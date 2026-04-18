function normalizeHttpErrorStatusCode(statusCode: number) {
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    return 500;
  }

  return statusCode;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string | undefined;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string | undefined; details?: unknown; expose?: boolean | undefined },
  ) {
    super(message);
    const normalizedStatusCode = normalizeHttpErrorStatusCode(statusCode);
    this.name = "HttpError";
    this.statusCode = normalizedStatusCode;
    this.code = options?.code;
    this.details = options?.details;
    this.expose = options?.expose ?? normalizedStatusCode < 500;
  }
}

export function badRequest(message: string, code?: string, details?: unknown) {
  return new HttpError(400, message, { code, details });
}

export function unauthorized(message = "Authentication required.", code?: string) {
  return new HttpError(401, message, { code });
}

export function forbidden(message = "Insufficient permissions.", code?: string) {
  return new HttpError(403, message, { code });
}

export function notFound(message = "Resource not found.", code?: string) {
  return new HttpError(404, message, { code });
}

export function conflict(message: string, code?: string) {
  return new HttpError(409, message, { code });
}
