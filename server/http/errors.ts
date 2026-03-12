export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly expose: boolean;

  constructor(statusCode: number, message: string, options?: { code?: string; expose?: boolean }) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.expose = options?.expose ?? statusCode < 500;
  }
}

export function badRequest(message: string, code?: string) {
  return new HttpError(400, message, { code });
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
