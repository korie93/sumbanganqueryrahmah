function getCurrentLocationHref() {
  const locationLike = (globalThis as typeof globalThis & {
    location?: { href?: string }
  }).location

  return typeof locationLike?.href === "string" && locationLike.href
    ? locationLike.href
    : "http://localhost/"
}

export function sanitizeTrustedScriptURL(input: string) {
  const rawInput = String(input || "").trim()
  if (!rawInput) {
    throw new TypeError("Trusted script URL is empty.")
  }

  const baseUrl = new URL(getCurrentLocationHref())
  let resolvedUrl: URL

  try {
    resolvedUrl = new URL(rawInput, baseUrl)
  } catch {
    throw new TypeError("Trusted script URL is invalid.")
  }

  if (resolvedUrl.protocol !== "http:" && resolvedUrl.protocol !== "https:") {
    throw new TypeError("Trusted script URL protocol is not allowed.")
  }

  if (resolvedUrl.origin !== baseUrl.origin) {
    throw new TypeError("Trusted script URL must be same-origin.")
  }

  return rawInput
}
