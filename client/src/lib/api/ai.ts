import { createApiHeaders } from "../api-client";
import { getCsrfHeader } from "./shared";

type AISearchRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function searchAI(query: string, options?: AISearchRequestOptions) {
  return fetch("/api/ai/search", {
    method: "POST",
    headers: createApiHeaders({
      "Content-Type": "application/json",
      ...(getCsrfHeader() as Record<string, string>),
    }),
    body: JSON.stringify({ query }),
    credentials: "include",
    signal: options?.signal ?? null,
  });
}
