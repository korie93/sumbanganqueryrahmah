import { createContext, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  normalizeSavedReturnContext,
  type SavedReturnContext,
} from "@/pages/saved/saved-return-context";

export interface SavedReturnNavigation {
  snapshot: SavedReturnContext | null;
  remember: (value: SavedReturnContext) => void;
  clear: () => void;
}

export const SavedReturnNavigationContext = createContext<SavedReturnNavigation | null>(null);

type SavedReturnProviderProps = {
  currentPage: string;
  selectedImportId?: string | undefined;
  children: ReactNode;
};

/** Keeps one account-owned return snapshot only during a direct Saved–Viewer journey. */
export function SavedReturnProvider({ currentPage, selectedImportId, children }: SavedReturnProviderProps) {
  const entryRef = useRef<{ context: SavedReturnContext; visitedViewer: boolean } | null>(null);
  const pageRef = useRef(currentPage);
  pageRef.current = currentPage;

  if (currentPage !== "saved" && currentPage !== "viewer") {
    entryRef.current = null;
  } else if (currentPage === "viewer" && entryRef.current) {
    if (selectedImportId !== entryRef.current.context.importId) entryRef.current = null;
    else entryRef.current.visitedViewer = true;
  }

  const snapshot = currentPage === "saved" && entryRef.current?.visitedViewer
    ? entryRef.current.context : null;
  const remember = useCallback((value: SavedReturnContext) => {
    if (pageRef.current !== "saved") return;
    const context = normalizeSavedReturnContext(value);
    entryRef.current = context ? { context, visitedViewer: false } : null;
  }, []);
  const clear = useCallback(() => { entryRef.current = null; }, []);
  const navigation = useMemo(() => ({ snapshot, remember, clear }), [snapshot, remember, clear]);

  return (
    <SavedReturnNavigationContext.Provider value={navigation}>
      {children}
    </SavedReturnNavigationContext.Provider>
  );
}
