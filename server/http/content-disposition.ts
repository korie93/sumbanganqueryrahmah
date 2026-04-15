const CONTENT_DISPOSITION_CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]+/g;
const CONTENT_DISPOSITION_PATH_SEPARATOR_PATTERN = /[\\/]+/g;
const CONTENT_DISPOSITION_UNSAFE_TOKEN_PATTERN = /[";]+/g;

export function sanitizeContentDispositionFilename(
  rawFileName: string,
  fallback = "download",
): string {
  const normalizedFallback = String(fallback || "download").trim() || "download";
  const normalized = String(rawFileName || "")
    .normalize("NFKC")
    .replace(CONTENT_DISPOSITION_CONTROL_CHAR_PATTERN, "")
    .replace(CONTENT_DISPOSITION_PATH_SEPARATOR_PATTERN, "_")
    .replace(CONTENT_DISPOSITION_UNSAFE_TOKEN_PATTERN, "")
    .trim()
    .slice(0, 180);

  return normalized || normalizedFallback;
}

export function buildContentDispositionHeader(
  disposition: "attachment" | "inline",
  rawFileName: string,
  fallback?: string,
): string {
  const safeFileName = sanitizeContentDispositionFilename(rawFileName, fallback);
  return `${disposition}; filename="${safeFileName}"`;
}
