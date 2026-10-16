type DailyOverlay = "day" | "receipt";
type FocusCloseEvent = Pick<Event, "preventDefault">;

function canReceiveFocus(target: HTMLElement | null): target is HTMLElement {
  return Boolean(
    target?.isConnected &&
    !target.matches(":disabled, [aria-disabled='true']") &&
    !target.closest("[hidden], [inert], [aria-hidden='true']") &&
    target.getClientRects().length,
  );
}

/** Separate launchers prevent a nested receipt from returning focus behind its parent. */
export function createCollectionDailyDialogFocus(
  getDocument: () => Document | null = () => typeof document === "undefined" ? null : document,
) {
  const origins = new Map<DailyOverlay, HTMLElement>();
  let selectedDate: string | undefined;

  return {
    remember(overlay: DailyOverlay, target?: HTMLElement | null, date?: string) {
      const doc = getDocument();
      const origin = target ?? (doc?.activeElement as HTMLElement | null);
      if (canReceiveFocus(origin) && origin !== doc?.body) origins.set(overlay, origin);
      else origins.delete(overlay);
      if (overlay === "day") selectedDate = date;
    },
    restore(overlay: DailyOverlay, event: FocusCloseEvent) {
      event.preventDefault();
      const origin = origins.get(overlay) ?? null;
      origins.delete(overlay);
      const doc = getDocument();
      if (!doc) return;
      const parent = doc.querySelector<HTMLElement>(
        '[data-testid="collection-daily-day-dialog"][data-state="open"]',
      );
      const openDialogs = Array.from(doc.querySelectorAll<HTMLElement>(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      ));

      if (overlay === "receipt") {
        // A concurrently closed parent owns the calendar return; never steal its focus.
        if (!parent || openDialogs.some((dialog) => dialog !== parent)) return;
        const target = canReceiveFocus(origin) && parent.contains(origin)
          ? origin
          : parent.querySelector<HTMLElement>('[aria-label="Collection day details scroll area"]');
        if (canReceiveFocus(target)) target.focus({ preventScroll: true });
        return;
      }

      // Another modal may have opened while the day dialog was closing.
      if (openDialogs.length) return;
      const date = selectedDate;
      selectedDate = undefined;
      const dateTrigger = Array.from(doc.querySelectorAll<HTMLElement>("[data-collection-daily-date]"))
        .find((element) => element.dataset.collectionDailyDate === date && canReceiveFocus(element)) ?? null;
      const fallback = doc.querySelector<HTMLElement>("[data-collection-daily-calendar]");
      const target = canReceiveFocus(origin) ? origin : dateTrigger ?? fallback;
      if (canReceiveFocus(target)) target.focus({ preventScroll: true });
    },
  };
}
