import { authUserResponseSchema } from "@shared/api-contracts";
import { parseApiJson, readApiJsonPayload } from "@/lib/api/contract";
import type { User } from "@/app/types";

export type TabSessionValidation =
  | { status: "verified"; user: User }
  | { status: "unauthenticated"; banned: boolean }
  | { status: "unavailable" };

/** Read-only identity check. Never revoke a session or broadcast to another tab. */
export async function validateTabSession(
  signal: AbortSignal,
  fetchSession: typeof fetch = fetch,
): Promise<TabSessionValidation> {
  if (signal.aborted) return { status: "unavailable" };
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    // Deliberately bypass apiRequest's forceLogout broadcast side effects: a
    // delayed response in this tab must never clear the owner's shared session.
    const response = await fetchSession("/api/me", {
      credentials: "include",
      cache: "no-store",
      signal: request.signal,
      headers: { Accept: "application/json" },
    });
    if (signal.aborted || request.signal.aborted) return { status: "unavailable" };
    if ([401, 403, 423].includes(response.status)) {
      let banned = false;
      try {
        const error = await readApiJsonPayload<{ banned?: unknown }>(response, "/api/me");
        banned = error?.banned === true;
      } catch { /* A malformed rejection still cannot authenticate this tab. */ }
      return signal.aborted || request.signal.aborted
        ? { status: "unavailable" } : { status: "unauthenticated", banned };
    }
    if (!response.ok) return { status: "unavailable" };
    const payload = await parseApiJson(response, authUserResponseSchema, "/api/me");
    if (signal.aborted || request.signal.aborted || !payload.user?.id?.trim()) {
      return { status: "unavailable" };
    }
    if (payload.user.isBanned === true || payload.user.status !== "active") {
      return { status: "unauthenticated", banned: payload.user.isBanned === true };
    }
    return {
      status: "verified",
      user: { ...payload.user, sessionExpiresAt: payload.sessionExpiresAt ?? null },
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
