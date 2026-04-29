const ROUTE_LABELS: Record<string, string> = {
  activity: "Aktiviti",
  ai: "Pembantu AI",
  analysis: "Analisis",
  audit: "Log Audit",
  "audit-logs": "Log Audit",
  backup: "Sandaran & Pemulihan",
  banned: "Akses Akaun",
  "change-password": "Tukar Kata Laluan",
  "collection-report": "Kutipan",
  dashboard: "Papan Pemuka",
  "forgot-password": "Lupa Kata Laluan",
  "general-search": "Carian Umum",
  home: "Laman Utama",
  import: "Import",
  login: "Log Masuk",
  maintenance: "Mod Penyelenggaraan",
  monitor: "Monitor Sistem",
  "not-found": "Halaman Tidak Ditemui",
  saved: "Import Tersimpan",
  settings: "Tetapan",
  viewer: "Paparan Data",
};

export function resolveRouteErrorTitle(routeLabel?: string | null): string {
  const normalized = String(routeLabel || "").trim();
  const humanLabel = ROUTE_LABELS[normalized] || normalized;
  return humanLabel ? `${humanLabel} Menghadapi Masalah` : "Halaman Ini Menghadapi Masalah";
}

export function resolveRouteErrorDescription(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message.trim()
      : String(error || "").trim();

  if (
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      message,
    )
  ) {
    return "Bundle halaman gagal dimuatkan. Cuba semula halaman ini dahulu, atau muat semula aplikasi jika masalah berterusan.";
  }

  if (message) {
    return message;
  }

  return "Halaman berhenti secara tidak dijangka. Cuba semula halaman ini, kembali ke laman utama, atau muat semula aplikasi.";
}
