const DEFAULT_AI_ERROR_MESSAGE = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";

export function resolveAiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message || DEFAULT_AI_ERROR_MESSAGE;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    return message || DEFAULT_AI_ERROR_MESSAGE;
  }

  return DEFAULT_AI_ERROR_MESSAGE;
}

