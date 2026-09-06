export class BillingPrincipalOwnerChangedError extends Error {
  constructor() {
    super("Authenticated account changed. Reload targets before continuing.");
    this.name = "BillingPrincipalOwnerChangedError";
  }
}

/** A viewer assertion is a freshness constraint, never an authorization grant. */
export function assertBillingPrincipalWorkspaceOwner(expectedOwnerId: string, actualOwnerId: string): void {
  if (!expectedOwnerId || expectedOwnerId !== actualOwnerId) throw new BillingPrincipalOwnerChangedError();
}
