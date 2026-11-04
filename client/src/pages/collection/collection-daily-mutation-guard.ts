/** Synchronous ownership prevents double saves before React commits busy state. */
export function createCollectionDailyMutationGuard() {
  let active: symbol | null = null;

  return {
    isBusy: () => active !== null,
    tryStart(kind: "target" | "calendar", hasCalendarDraft: boolean) {
      if (active !== null || (kind === "target" && hasCalendarDraft)) return null;
      const owner = Symbol(kind);
      active = owner;
      return () => {
        if (active === owner) active = null;
      };
    },
  };
}
