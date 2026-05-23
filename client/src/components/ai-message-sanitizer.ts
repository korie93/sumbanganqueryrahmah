const DANGEROUS_AI_HTML_TAG_PATTERN =
  /<\/?(?:script|style|iframe|object|embed|link|meta|base|form|input|button|svg|math)\b[^>]*>/gi;
const DANGEROUS_AI_HTML_EVENT_ATTR_PATTERN =
  /\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const DANGEROUS_AI_HTML_URL_ATTR_PATTERN =
  /\s+(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|data):[^"]*"|'\s*(?:javascript|data):[^']*'|(?:javascript|data):[^\s>]*)/gi;
function isUnsafeAIControlCharacter(codePoint: number) {
  return (codePoint >= 0x00 && codePoint <= 0x08)
    || codePoint === 0x0B
    || codePoint === 0x0C
    || (codePoint >= 0x0E && codePoint <= 0x1F)
    || codePoint === 0x7F
    || (codePoint >= 0x202A && codePoint <= 0x202E)
    || (codePoint >= 0x2066 && codePoint <= 0x2069);
}

function removeUnsafeAIControlCharacters(content: string) {
  let safeContent = "";
  for (const character of content) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || isUnsafeAIControlCharacter(codePoint)) {
      continue;
    }
    safeContent += character;
  }
  return safeContent;
}

export function sanitizeAIMessageContentForDisplay(content: string): string {
  const sanitizedContent = content
    .replace(/\r\n?/g, "\n")
    .replace(DANGEROUS_AI_HTML_TAG_PATTERN, "")
    .replace(DANGEROUS_AI_HTML_EVENT_ATTR_PATTERN, "")
    .replace(DANGEROUS_AI_HTML_URL_ATTR_PATTERN, "");
  return removeUnsafeAIControlCharacters(sanitizedContent);
}
