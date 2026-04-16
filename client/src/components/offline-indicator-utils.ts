export function readNavigatorOnlineState(
  navigatorLike: Pick<Navigator, "onLine"> | null | undefined,
): boolean {
  if (!navigatorLike || typeof navigatorLike.onLine !== "boolean") {
    return true;
  }

  return navigatorLike.onLine;
}

export function resolveOfflineIndicatorMessage(): string {
  return "Sambungan internet terputus. Aplikasi akan cuba menyambung semula secara automatik.";
}
