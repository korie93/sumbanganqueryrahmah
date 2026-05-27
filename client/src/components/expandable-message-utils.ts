export const EXPANDABLE_MESSAGE_PREVIEW_LIMIT = 240;

export type ExpandableMessageParts = {
  fullText: string;
  isTruncated: boolean;
  previewText: string;
};

export function buildExpandableMessageParts(
  value: string,
  previewLimit = EXPANDABLE_MESSAGE_PREVIEW_LIMIT,
): ExpandableMessageParts {
  const fullText = String(value || "").trim();
  const safeLimit = Math.max(16, Math.trunc(previewLimit));

  if (fullText.length <= safeLimit) {
    return {
      fullText,
      isTruncated: false,
      previewText: fullText,
    };
  }

  const previewText = `${fullText.slice(0, safeLimit - 3).trimEnd()}...`;
  return {
    fullText,
    isTruncated: true,
    previewText,
  };
}
