export type ErrorMessageContext = {
  action?: string | undefined;
  retryAfterMs?: number | null | undefined;
};

import { translate } from "@/lib/i18n";

function formatRetryAfter(retryAfterMs: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return translate("errors.retryAfter", { seconds });
}

export const API_ERROR_MESSAGES: Record<number, (context?: ErrorMessageContext) => string> = {
  400: (context) => translate("errors.http.400", { action: context?.action || translate("common.actions.checkInput") }),
  401: () => translate("errors.http.401"),
  403: () => translate("errors.http.403"),
  404: () => translate("errors.http.404"),
  409: (context) => translate("errors.http.409", { action: context?.action || translate("common.actions.retrySoon") }),
  413: () => translate("errors.http.413"),
  422: (context) => translate("errors.http.422", { action: context?.action || translate("common.actions.checkInput") }),
  429: (context) => translate("errors.http.429", {
    retryAfter: context?.retryAfterMs
      ? formatRetryAfter(context.retryAfterMs)
      : translate("common.actions.waitBeforeRetry"),
  }),
  500: () => translate("errors.http.500"),
  502: () => translate("errors.http.502"),
  503: () => translate("errors.http.503"),
  504: () => translate("errors.http.504"),
};

export const NETWORK_ERROR_MESSAGE =
  translate("errors.network");

export const UNKNOWN_API_ERROR_MESSAGE =
  translate("errors.unknown");

export function getHttpStatusErrorMessage(
  status: number | null | undefined,
  context?: ErrorMessageContext,
) {
  if (!status || !Number.isFinite(status)) {
    return UNKNOWN_API_ERROR_MESSAGE;
  }

  const resolver = API_ERROR_MESSAGES[Math.trunc(status)];
  return resolver ? resolver(context) : UNKNOWN_API_ERROR_MESSAGE;
}

export function isGenericApiErrorMessage(message: string) {
  return /^(request failed|something went wrong|unknown error|error occurred|failed)$/i
    .test(message.trim());
}
