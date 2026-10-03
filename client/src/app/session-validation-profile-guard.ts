import type { User } from "@/app/types";
import { createAccountProfilePatch, mergeAccountProfile } from "@/lib/account-profile";

/** Preserve a completed personal mutation when an older /me read arrives later. */
export function createSessionValidationProfileGuard(actor: User) {
  let latestProfile: User | null = null;

  return {
    recordProfileUpdate(update: User) {
      if (mergeAccountProfile(actor, update) === actor) return;
      latestProfile = {
        ...latestProfile,
        ...createAccountProfilePatch(update, "all"),
        id: actor.id, username: actor.username, role: actor.role, sessionExpiresAt: actor.sessionExpiresAt,
      };
    },
    applyTo(authoritative: User): User {
      // Keep only fields touched while this read was pending. Unrelated personal
      // fields and all roles, bans and password gates remain authoritative /me's.
      return latestProfile ? mergeAccountProfile(authoritative, latestProfile) ?? authoritative : authoritative;
    },
  };
}
