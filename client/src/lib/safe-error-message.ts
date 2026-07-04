const DEFAULT_MAX_SAFE_ERROR_MESSAGE_LENGTH = 500;

const ACTIVE_HTML_PATTERN =
  /(?:<|&lt;|&#0*60;|&#x0*3c;)\s*\/?\s*(?:script|img|svg|iframe|object|embed|link|meta|base|math|style|form|input|button)\b/i;
const EVENT_HANDLER_PATTERN = /\bon[a-z][\w:-]*\s*=/i;
const DANGEROUS_URL_PATTERN = /\b(?:javascript|data)\s*:/i;
const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/g;
const WHITESPACE_PATTERN = /[ \t\f\v]+/g;

const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:authorization|cookie|database_url|jwt_secret|openai_api_key|password|passwd|pg_password|private[_-]?key|secret|session_secret|set-cookie|token|api[_-]?key)\b\s*[:=]/i;
const JWT_LIKE_PATTERN = /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const STACK_TRACE_PATTERN = /\bat\s+(?:\S+\s+)?\(?[^()\n\r]+:\d+:\d+\)?/i;
const FILE_PATH_PATTERN = /(?:[A-Za-z]:\\|\/(?:app|etc|home|opt|runner|tmp|usr|var|workspace)\/)[^\s"'<>]+/i;

type SanitizeUntrustedErrorMessageOptions = {
  maxLength?: number;
};

function decodeHtmlDetectionEntities(value: string) {
  return value
    .replace(/&lt;|&#0*60;|&#x0*3c;/gi, "<")
    .replace(/&gt;|&#0*62;|&#x0*3e;/gi, ">")
    .replace(/&colon;|&#0*58;|&#x0*3a;/gi, ":");
}

function isUnsafeErrorControlCharacter(codePoint: number) {
  return (codePoint >= 0x00 && codePoint <= 0x08)
    || codePoint === 0x0B
    || codePoint === 0x0C
    || (codePoint >= 0x0E && codePoint <= 0x1F)
    || codePoint === 0x7F
    || (codePoint >= 0x202A && codePoint <= 0x202E)
    || (codePoint >= 0x2066 && codePoint <= 0x2069);
}

function removeUnsafeErrorControlCharacters(value: string) {
  let safeValue = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || isUnsafeErrorControlCharacter(codePoint)) {
      continue;
    }
    safeValue += character;
  }
  return safeValue;
}

function normalizeErrorText(value: string) {
  return removeUnsafeErrorControlCharacters(value)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(HTML_TAG_PATTERN, " ")
    .split("\n")
    .map((line) => line.replace(WHITESPACE_PATTERN, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function containsUnsafeErrorDisclosure(value: string) {
  return SECRET_ASSIGNMENT_PATTERN.test(value)
    || JWT_LIKE_PATTERN.test(value)
    || PRIVATE_KEY_PATTERN.test(value)
    || STACK_TRACE_PATTERN.test(value)
    || FILE_PATH_PATTERN.test(value);
}

function containsActiveHtml(value: string) {
  const decoded = decodeHtmlDetectionEntities(value);
  return ACTIVE_HTML_PATTERN.test(decoded)
    || EVENT_HANDLER_PATTERN.test(decoded)
    || DANGEROUS_URL_PATTERN.test(decoded);
}

export function sanitizeUntrustedErrorMessage(
  value: unknown,
  fallbackMessage: string,
  options: SanitizeUntrustedErrorMessageOptions = {},
) {
  const raw = typeof value === "string" ? value : String(value ?? "");
  const normalizedRaw = raw.normalize("NFKC");

  if (
    containsActiveHtml(normalizedRaw)
    || containsUnsafeErrorDisclosure(normalizedRaw)
  ) {
    return fallbackMessage;
  }

  const normalized = normalizeErrorText(normalizedRaw);
  if (!normalized || containsUnsafeErrorDisclosure(normalized)) {
    return fallbackMessage;
  }

  const maxLength = options.maxLength ?? DEFAULT_MAX_SAFE_ERROR_MESSAGE_LENGTH;
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized;
}
