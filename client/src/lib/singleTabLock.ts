/**
 * Atomic ownership for one authenticated account in this browser's origin and
 * storage partition. Based on the supplied SQR Single Active Tab package.
 *
 * Web Locks own the lifetime; no cookie, token, session or storage is changed.
 * This is not a cross-browser/device security boundary or a backend lease.
 */
export type SingleTabLockResult = "active" | "blocked" | "unsupported" | "error";

export interface SingleTabLockOptions {
  /** The browser unexpectedly stopped holding a previously granted lock. */
  onOwnershipLost?: () => void;
}

type Ownership = { release: () => void };

function accountLockName(accountId: string | number): string {
  if (
    (typeof accountId !== "string" && typeof accountId !== "number")
    || (typeof accountId === "number" && !Number.isSafeInteger(accountId))
  ) {
    throw new Error("ID akaun yang sah diperlukan untuk kawalan tab SQR.");
  }
  const id = String(accountId).trim();
  if (!id || id === "undefined" || id === "null") {
    throw new Error("ID akaun yang sah diperlukan untuk kawalan tab SQR.");
  }
  return `sqr:active-tab:v1:${id}`;
}

export class SingleTabLock {
  readonly name: string;
  private isDisposed = false;
  private ownership: Ownership | null = null;
  private inFlight: Promise<SingleTabLockResult> | null = null;
  private settlePending: ((status: SingleTabLockResult) => void) | null = null;
  private readonly onOwnershipLost: (() => void) | undefined;

  constructor(accountId: string | number, options: SingleTabLockOptions = {}) {
    this.name = accountLockName(accountId);
    this.onOwnershipLost = options.onOwnershipLost;
  }

  get active(): boolean {
    return this.ownership !== null && !this.isDisposed;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  tryAcquire(): Promise<SingleTabLockResult> {
    if (this.isDisposed) return Promise.resolve("error");
    if (this.active) return Promise.resolve("active");
    if (this.inFlight) return this.inFlight;

    let locks: LockManager;
    try {
      // Also fail closed during SSR and in insecure/unsupported contexts.
      if (typeof navigator === "undefined" || typeof navigator.locks?.request !== "function") {
        return Promise.resolve("unsupported");
      }
      locks = navigator.locks;
    } catch {
      return Promise.resolve("error");
    }

    let resolveAcquisition!: (status: SingleTabLockResult) => void;
    const pending = new Promise<SingleTabLockResult>((resolve) => {
      resolveAcquisition = resolve;
    });
    let finished = false;
    const settle = (status: SingleTabLockResult) => {
      if (finished) return;
      finished = true;
      if (this.inFlight === pending) this.inFlight = null;
      if (this.settlePending === settle) this.settlePending = null;
      resolveAcquisition(status);
    };
    // Assign before requesting: even a synchronous rejection must clean up.
    this.inFlight = pending;
    this.settlePending = settle;
    let grantedOwnership: Ownership | null = null;

    const requestFailed = () => {
      if (grantedOwnership && this.ownership === grantedOwnership) {
        const wasActive = this.active;
        this.ownership = null;
        grantedOwnership.release();
        if (wasActive) {
          // The gate must immediately stop its protected subtree on lock loss.
          // A consumer exception must not leave an unhandled request rejection.
          try {
            this.onOwnershipLost?.();
          } catch {
            // Ownership is already cleared; never restore it after a UI error.
          }
        }
      }
      settle("error");
    };

    try {
      const request = locks.request(
        this.name,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (this.isDisposed) {
            settle("error");
            return;
          }
          if (!lock) {
            settle("blocked");
            return;
          }

          let unlock!: () => void;
          const lifetime = new Promise<void>((resolve) => { unlock = resolve; });
          const owner: Ownership = { release: unlock };
          grantedOwnership = owner;
          this.ownership = owner;
          settle("active");
          // Do not await the request in tryAcquire: this callback must remain
          // unresolved for the entire protected-app lifetime.
          try {
            await lifetime;
          } finally {
            if (this.ownership === owner) this.ownership = null;
          }
        },
      );
      // Only the callback may grant ownership. The outer promise cannot grant it.
      void request.catch(requestFailed);
    } catch {
      requestFailed();
    }
    return pending;
  }

  /** Terminal local cleanup only. It must never log out another tab's session. */
  release(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.settlePending?.("error");
    const owner = this.ownership;
    this.ownership = null;
    owner?.release();
  }
}
