import { ERROR_CODES, type ErrorCode } from "../../shared/error-codes";
import { sanitizeHttpErrorDetails } from "./error-details";

export type ApiErrorDetail = {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
};

export type ApiErrorResponse = {
  ok: false;
  message: string;
  code: ErrorCode;
  requestId?: string;
  error: ApiErrorDetail;
};

type ApiErrorResponseOptions = {
  code?: ErrorCode | undefined;
  details?: unknown;
  extra?: Record<string, unknown> | undefined;
  requestId?: string | undefined;
  statusCode?: number | undefined;
};

export function resolveApiErrorCode(statusCode: number | undefined, explicitCode: ErrorCode | undefined): ErrorCode {
  if (explicitCode) {
    return explicitCode;
  }

  switch (statusCode) {
    case 400:
      return ERROR_CODES.REQUEST_BODY_INVALID;
    case 401:
      return ERROR_CODES.UNAUTHORIZED;
    case 403:
      return ERROR_CODES.PERMISSION_DENIED;
    case 404:
      return ERROR_CODES.NOT_FOUND;
    case 409:
      return ERROR_CODES.CONFLICT;
    case 413:
      return ERROR_CODES.PAYLOAD_TOO_LARGE;
    case 423:
      return ERROR_CODES.ACCOUNT_LOCKED;
    case 429:
      return ERROR_CODES.RATE_LIMITED;
    case 503:
      return ERROR_CODES.SERVICE_UNAVAILABLE;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

export function buildApiErrorResponse(
  message: string,
  options: ApiErrorResponseOptions = {},
): ApiErrorResponse & Record<string, unknown> {
  const code = resolveApiErrorCode(options.statusCode, options.code);
  const sanitizedDetails = options.details !== undefined
    ? sanitizeHttpErrorDetails(options.details)
    : undefined;
  const error: ApiErrorDetail = {
    code,
    message,
    ...(sanitizedDetails !== undefined ? { details: sanitizedDetails } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
  };

  return {
    ok: false,
    message,
    ...(options.extra ?? {}),
    code,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    error,
  };
}
