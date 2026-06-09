import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import { getHttpStatusErrorMessage, isGenericApiErrorMessage, UNKNOWN_API_ERROR_MESSAGE } from "@/constants/errorMessages";
import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";

export type MutationToastPayload = {
  title: string;
  description: string;
  variant?: "default" | "destructive" | "info" | "success" | "warning";
  duration?: number;
  requestId?: string;
};

type BuildMutationSuccessToastInput = {
  title: string;
  description: string;
  duration?: number;
};

type BuildMutationErrorToastInput = {
  title: string;
  description?: string;
  error?: unknown;
  fallbackDescription?: string;
  duration?: number;
};

export function resolveMutationErrorDetails(
  error: unknown,
  fallbackDescription = UNKNOWN_API_ERROR_MESSAGE,
): { message: string; requestId: string | null } {
  const details = parseCollectionApiErrorDetails(error);
  const parsedMessage = details.message.trim();
  const message = parsedMessage && !isGenericApiErrorMessage(parsedMessage)
    ? parsedMessage
    : getHttpStatusErrorMessage(details.status) || fallbackDescription;

  return {
    message,
    requestId: normalizeToastRequestId(details.requestId),
  };
}

export function resolveMutationErrorMessage(
  error: unknown,
  fallbackDescription = UNKNOWN_API_ERROR_MESSAGE,
): string {
  return resolveMutationErrorDetails(error, fallbackDescription).message;
}

export function buildMutationSuccessToast(
  input: BuildMutationSuccessToastInput,
): MutationToastPayload {
  return {
    title: input.title,
    description: input.description,
    variant: "success",
    ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
  };
}

export function buildMutationErrorToast(
  input: BuildMutationErrorToastInput,
): MutationToastPayload {
  const details = resolveMutationErrorDetails(input.error, input.fallbackDescription);
  return {
    title: input.title,
    description:
      String(input.description || "").trim()
      || details.message,
    variant: "destructive",
    ...(details.requestId ? { requestId: details.requestId } : {}),
    ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
  };
}
