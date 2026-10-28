import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type { SavedReturnNavigation } from "@/app/SavedReturnProvider";
import { formatSavedReturnDate, type SavedReturnContext } from "@/pages/saved/saved-return-context";
import type { useSavedPageState } from "@/pages/saved/useSavedPageState";

type SavedState = ReturnType<typeof useSavedPageState>;
type Options = {
  initialContext: SavedReturnContext | null;
  navigation: SavedReturnNavigation | null;
  state: SavedState;
  searchInputRef: RefObject<HTMLInputElement>;
};

/** Restores one fresh list once, unless the person starts another action while it loads. */
export function useSavedReturnPosition({ initialContext, navigation, state, searchInputRef }: Options) {
  const pendingRef = useRef(Boolean(initialContext));
  const query = useMemo(() => ({
    page: state.page, pageSize: state.pageSize, searchTerm: state.searchTerm,
    uploaderFilter: state.uploaderFilter, createdOn: formatSavedReturnDate(state.dateFilter),
    minRowsFilter: state.minRowsFilter, maxRowsFilter: state.maxRowsFilter,
    workspaceView: state.workspaceView,
  }), [state.page, state.pageSize, state.searchTerm, state.uploaderFilter, state.dateFilter,
    state.minRowsFilter, state.maxRowsFilter, state.workspaceView]);
  // A server clamp may change page; changing any other filter abandons restoration.
  const matchingQuery = !initialContext || (query.pageSize === initialContext.query.pageSize
    && query.searchTerm === initialContext.query.searchTerm && query.uploaderFilter === initialContext.query.uploaderFilter
    && query.createdOn === initialContext.query.createdOn && query.minRowsFilter === initialContext.query.minRowsFilter
    && query.maxRowsFilter === initialContext.query.maxRowsFilter && query.workspaceView === initialContext.query.workspaceView);
  const clear = navigation?.clear;
  useEffect(() => { clear?.(); }, [clear]);

  useEffect(() => {
    if (!initialContext) return;
    const cancel = (event: Event) => { if (event.isTrusted) pendingRef.current = false; };
    for (const type of ["pointerdown", "keydown", "input", "wheel", "touchstart"]) {
      window.addEventListener(type, cancel, { capture: true, passive: true });
    }
    return () => {
      for (const type of ["pointerdown", "keydown", "input", "wheel", "touchstart"]) {
        window.removeEventListener(type, cancel, true);
      }
    };
  }, [initialContext]);

  useEffect(() => {
    if (!initialContext || !pendingRef.current) return;
    if (!matchingQuery) { pendingRef.current = false; return; }
    if (state.loading || state.searchPending || (!state.hasPage && !state.error)) return;
    const frame = window.requestAnimationFrame(() => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      const search = searchInputRef.current;
      const root = search?.closest<HTMLElement>(".saved-workspace");
      const anchor = root && Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-testid]"))
        .find((button) => button.dataset.testid === `button-view-${initialContext.importId}`);
      if (!state.error && anchor?.isConnected && !anchor.disabled) {
        const region = root?.querySelector<HTMLElement>('[data-testid="saved-files-scroll-region"]');
        if (region) {
          region.scrollTop = initialContext.scroll.listTop;
          region.scrollLeft = initialContext.scroll.listLeft;
        }
        window.scrollTo({ left: initialContext.scroll.windowX, top: initialContext.scroll.windowY, behavior: "instant" });
        anchor.focus({ preventScroll: true });
        anchor.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      } else if (search?.isConnected) {
        search.focus({ preventScroll: true });
        search.scrollIntoView({ block: "nearest", behavior: "instant" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialContext, matchingQuery, state.loading, state.searchPending, state.hasPage, state.error, searchInputRef]);

  const handleView = useCallback((item: { id: string; name: string }) => {
    const root = searchInputRef.current?.closest<HTMLElement>(".saved-workspace");
    const region = root?.querySelector<HTMLElement>('[data-testid="saved-files-scroll-region"]');
    navigation?.remember({ query, importId: item.id, scroll: {
      windowX: Math.max(0, window.scrollX), windowY: Math.max(0, window.scrollY),
      listLeft: Math.max(0, region?.scrollLeft ?? 0), listTop: Math.max(0, region?.scrollTop ?? 0),
    } });
    state.handleView(item);
  }, [navigation, query, searchInputRef, state.handleView]);
  return handleView;
}
