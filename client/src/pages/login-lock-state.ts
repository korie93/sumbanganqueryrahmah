export function normalizeLoginIdentity(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isLockedAccountFlow(params: {
  lockedUsername: string | null | undefined;
  currentUsername: string | null | undefined;
  twoFactorChallengeToken?: string | null | undefined;
}): boolean {
  if (String(params.twoFactorChallengeToken || "").trim()) {
    return false;
  }

  const lockedUsername = normalizeLoginIdentity(params.lockedUsername);
  if (!lockedUsername) {
    return false;
  }

  return lockedUsername === normalizeLoginIdentity(params.currentUsername);
}
