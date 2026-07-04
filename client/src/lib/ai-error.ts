import { sanitizeUntrustedErrorMessage } from "@/lib/safe-error-message";

const DEFAULT_AI_ERROR_MESSAGE = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";

export function resolveAiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return sanitizeUntrustedErrorMessage(error.message, DEFAULT_AI_ERROR_MESSAGE);
  }

  if (error && typeof error === "object" && "message" in error) {
    return sanitizeUntrustedErrorMessage(
      (error as { message?: unknown }).message,
      DEFAULT_AI_ERROR_MESSAGE,
    );
  }

  return DEFAULT_AI_ERROR_MESSAGE;
}

