export function resolveMonitorSectionPageSize(section: "metrics" | "charts", isMobile: boolean) {
  if (section === "metrics") {
    return isMobile ? 2 : 3;
  }

  return isMobile ? 2 : 4;
}

export function paginateMonitorSectionItems<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
  const startIndex = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    items: items.slice(startIndex, startIndex + safePageSize),
  };
}
