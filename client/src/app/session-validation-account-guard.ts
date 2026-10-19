import type { User } from "@/app/types";

export type SessionValidationAccountResolution =
  | "same-account"
  | "rebind-account"
  | "unverified-account";

/** A protected runtime may only accept /me updates for its existing account. */
export function resolveSessionValidationAccount(
  actor: Pick<User, "id">,
  authoritative: Pick<User, "id">,
): SessionValidationAccountResolution {
  const authoritativeId = authoritative.id;
  if (typeof authoritativeId !== "string" || !authoritativeId.trim()) {
    return "unverified-account";
  }

  return actor.id === authoritativeId ? "same-account" : "rebind-account";
}
