let fallbackCounter = 0;

function readBrowserCrypto(): Crypto | undefined {
  return typeof globalThis.crypto === "object" ? globalThis.crypto : undefined;
}

function nextFallbackToken(): string {
  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  const highResolutionTime = typeof performance !== "undefined" && typeof performance.now === "function"
    ? Math.trunc(performance.now() * 1_000).toString(36)
    : "0";

  return `${Date.now().toString(36)}-${highResolutionTime}-${fallbackCounter.toString(36)}`;
}

export function createClientRandomId(prefix?: string): string {
  const crypto = readBrowserCrypto();
  const randomToken = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : createClientRandomHex(16);

  return prefix ? `${prefix}-${randomToken}` : randomToken;
}

export function createClientRandomHex(byteLength = 16): string {
  const crypto = readBrowserCrypto();
  const normalizedByteLength = Math.max(1, Math.trunc(byteLength));

  if (typeof crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(normalizedByteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return nextFallbackToken();
}

export function createClientRandomUnitInterval(): number {
  const crypto = readBrowserCrypto();

  if (typeof crypto?.getRandomValues === "function") {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x1_0000_0000;
  }

  fallbackCounter = (fallbackCounter + 1) % Number.MAX_SAFE_INTEGER;
  return ((Date.now() + fallbackCounter) % 1_000_000) / 1_000_000;
}
