export type ManagedAccountDialogKind = "edit" | "reset" | "ban" | "delete";

/** Passes a stable list opener across Details -> account action modal transitions. */
export function createManagedAccountDialogFocusHandoff() {
  let pending: { accountId: string; kind: ManagedAccountDialogKind; target: HTMLElement } | null = null;

  return {
    setForDialog(accountId: string, kind: ManagedAccountDialogKind, target: HTMLElement | null) {
      pending = target ? { accountId, kind, target } : null;
    },
    takeForDialog(accountId: string | undefined, kind: ManagedAccountDialogKind): HTMLElement | null {
      const handoff = pending;
      pending = null;
      return handoff && handoff.accountId === accountId && handoff.kind === kind ? handoff.target : null;
    },
  };
}

export const managedAccountDialogFocusHandoff = createManagedAccountDialogFocusHandoff();
