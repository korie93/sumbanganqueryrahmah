export function buildMonitorPaginationQuery(
  input?: {
    page?: number;
    pageSize?: number;
  },
): string {
  const searchParams = new URLSearchParams();

  if (Number.isFinite(input?.page) && Number(input?.page) > 0) {
    searchParams.set("page", String(Math.floor(Number(input?.page))));
  }

  if (Number.isFinite(input?.pageSize) && Number(input?.pageSize) > 0) {
    searchParams.set("pageSize", String(Math.floor(Number(input?.pageSize))));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}
