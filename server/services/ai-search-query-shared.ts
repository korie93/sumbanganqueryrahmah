export type AiSearchJsonRecord = Record<string, unknown>;

export type AiSearchRowLike = {
  rowId?: string;
  jsonDataJsonb?: unknown;
  [key: string]: unknown;
};

export function toObjectJson(value: unknown): AiSearchJsonRecord | null {
  if (!value) return null;
  if (typeof value === "object") return value as AiSearchJsonRecord;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as AiSearchJsonRecord) : null;
    } catch {
      return null;
    }
  }
  return null;
}
