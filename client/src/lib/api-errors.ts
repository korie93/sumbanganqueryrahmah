export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const message = String((error as { message?: string }).message || "").trim();
  if (!message) {
    return fallback;
  }

  const jsonPart = message.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(jsonPart);
    return String(parsed?.error?.message || parsed?.message || fallback);
  } catch {
    return message;
  }
}
