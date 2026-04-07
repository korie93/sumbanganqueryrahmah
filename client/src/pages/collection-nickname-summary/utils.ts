export type NicknameTotalSummary = {
  nickname: string;
  totalAmount: number;
  totalRecords: number;
};

export function normalizeNicknameTotals(rows: unknown): NicknameTotalSummary[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => {
      const record = isObjectRecord(item) ? item : {};
      return {
        nickname: String(record.nickname || "").trim(),
        totalRecords: Number(record.totalRecords || 0),
        totalAmount: Number(record.totalAmount || 0),
      };
    })
    .filter((item) => item.nickname !== "")
    .sort((left, right) =>
      left.nickname.localeCompare(right.nickname, undefined, {
        sensitivity: "base",
      }),
    );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
