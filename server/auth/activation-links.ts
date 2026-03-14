function readBaseUrlEnv(name: string): string | null {
  const raw = String(process.env[name] || "").trim();
  return raw ? raw : null;
}

export function getPublicAppBaseUrl(): string {
  const configured =
    readBaseUrlEnv("PUBLIC_APP_URL")
    || readBaseUrlEnv("APP_BASE_URL")
    || readBaseUrlEnv("CLIENT_APP_URL");

  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/+$/, "");
    } catch {
      // Fall back to local default below when the configured value is invalid.
    }
  }

  return "http://127.0.0.1:5000";
}

export function buildActivationUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/activate-account", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildPasswordResetUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
