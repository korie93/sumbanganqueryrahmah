export type NicknameTotalSummary = {
  nickname: string;
  totalAmount: number;
  totalRecords: number;
};

export function normalizeNicknameTotals(rows: unknown): NicknameTotalSummary[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      nickname: String((item as any)?.nickname || "").trim(),
      totalRecords: Number((item as any)?.totalRecords || 0),
      totalAmount: Number((item as any)?.totalAmount || 0),
    }))
    .filter((item) => item.nickname !== "")
    .sort((left, right) =>
      left.nickname.localeCompare(right.nickname, undefined, {
        sensitivity: "base",
      }),
    );
}
