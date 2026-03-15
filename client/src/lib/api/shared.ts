export const API_BASE = "";

export function getStoredToken(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem("token");
}

export function getAuthHeader(): HeadersInit {
  const token = getStoredToken();
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}
