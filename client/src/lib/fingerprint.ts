export async function generateFingerprint(): Promise<string> {
  const data = [
    navigator.userAgent,
    navigator.platform,
    navigator.vendor,
    `${screen.width}x${screen.height}`,
    navigator.language,
  ].join("||");

  if (crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fall back to a simpler deterministic hash below.
    }
  }

  let hash = 0;
  for (let index = 0; index < data.length; index += 1) {
    const char = data.charCodeAt(index);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }

  return Math.abs(hash).toString(16).padStart(16, "0");
}
