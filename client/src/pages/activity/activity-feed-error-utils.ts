export function readActivityFeedErrorMessage(error: unknown): string | null {
  if (error instanceof DOMException && error.name === "AbortError") {
    return null
  }

  const rawMessage = error instanceof Error ? error.message.trim() : ""
  const normalizedMessage = rawMessage.toLowerCase()

  if (normalizedMessage.includes("offline")) {
    return "Aktiviti tidak dapat dimuat semula kerana peranti ini kelihatan offline."
  }

  if (normalizedMessage.includes("timed out") || normalizedMessage.includes("timeout")) {
    return "Aktiviti mengambil masa terlalu lama untuk dimuat semula. Sila cuba lagi."
  }

  return "Aktiviti tidak dapat dimuat semula sekarang. Sila semak sambungan rangkaian dan cuba lagi."
}
