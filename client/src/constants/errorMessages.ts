export type ErrorMessageContext = {
  action?: string | undefined;
  retryAfterMs?: number | null | undefined;
};

const DEFAULT_ACTION = "Sila cuba semula sebentar lagi.";

function formatRetryAfter(retryAfterMs: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Sila tunggu ${seconds} saat sebelum cuba lagi.`;
}

export const API_ERROR_MESSAGES: Record<number, (context?: ErrorMessageContext) => string> = {
  400: (context) => `Permintaan tidak lengkap atau tidak sah. ${context?.action || "Semak input dan cuba lagi."}`,
  401: () => "Sesi anda telah tamat atau token tidak sah. Sila log masuk semula.",
  403: () => "Anda tiada kebenaran untuk tindakan ini. Hubungi pentadbir jika akses diperlukan.",
  404: () => "Rekod atau halaman yang diminta tidak ditemui. Semak pilihan anda dan cuba lagi.",
  409: (context) => `Data berubah atau memerlukan pengesahan tambahan. ${context?.action || "Muat semula dan cuba lagi."}`,
  413: () => "Fail atau data yang dipilih terlalu besar. Kurangkan saiz fail atau hubungi pentadbir untuk had muat naik.",
  422: (context) => `Input tidak dapat diproses. ${context?.action || "Semak nilai yang dimasukkan dan cuba lagi."}`,
  429: (context) => `Terlalu banyak percubaan. ${context?.retryAfterMs ? formatRetryAfter(context.retryAfterMs) : "Sila tunggu sebelum cuba lagi."}`,
  500: () => "Ralat server berlaku. Pasukan operasi telah dimaklumkan; cuba lagi sebentar lagi.",
  502: () => "Gateway server tidak stabil. Cuba lagi sebentar lagi.",
  503: () => "Servis sedang sibuk atau dalam penyelenggaraan. Cuba lagi sebentar lagi.",
  504: () => "Permintaan mengambil masa terlalu lama. Cuba lagi atau kecilkan skop carian.",
};

export const NETWORK_ERROR_MESSAGE =
  "Sambungan terputus. Semak internet anda dan cuba semula.";

export const UNKNOWN_API_ERROR_MESSAGE =
  `Permintaan tidak dapat diselesaikan. ${DEFAULT_ACTION}`;

export function getHttpStatusErrorMessage(
  status: number | null | undefined,
  context?: ErrorMessageContext,
) {
  if (!status || !Number.isFinite(status)) {
    return UNKNOWN_API_ERROR_MESSAGE;
  }

  const resolver = API_ERROR_MESSAGES[Math.trunc(status)];
  return resolver ? resolver(context) : UNKNOWN_API_ERROR_MESSAGE;
}

export function isGenericApiErrorMessage(message: string) {
  return /^(request failed|something went wrong|unknown error|error occurred|failed)$/i
    .test(message.trim());
}
