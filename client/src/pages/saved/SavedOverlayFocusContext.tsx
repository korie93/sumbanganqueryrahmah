import { createContext, useContext } from "react";
import type { SavedOverlayFocus } from "@/pages/saved/saved-overlay-focus";

export const SavedOverlayFocusContext = createContext<SavedOverlayFocus | null>(null);

export function useSavedOverlayFocus() {
  return useContext(SavedOverlayFocusContext);
}
