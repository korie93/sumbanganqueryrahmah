import { createContext, useContext } from "react";
import type { ActivityOverlayFocus } from "./activity-overlay-focus";

export const ActivityOverlayFocusContext = createContext<ActivityOverlayFocus | null>(null);

export function useActivityOverlayFocus() {
  return useContext(ActivityOverlayFocusContext);
}
