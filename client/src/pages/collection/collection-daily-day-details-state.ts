import type { CollectionDailyDayDetailsResponse } from "@/lib/api/collection-types";

export type CollectionDailyDayDetailsState = {
  requestId: number;
  scopeKey: string;
  selectedDate: string | null;
  dayDetails: CollectionDailyDayDetailsResponse | null;
  loadingDayDetails: boolean;
  dayDetailsError: string | null;
};

type DayDetailsAction =
  | { type: "begin"; requestId: number; scopeKey: string; date: string; cachedDetails?: CollectionDailyDayDetailsResponse }
  | { type: "success"; requestId: number; details: CollectionDailyDayDetailsResponse }
  | { type: "failure"; requestId: number; message: string }
  | { type: "clear"; requestId: number };

export const initialCollectionDailyDayDetailsState: CollectionDailyDayDetailsState = {
  requestId: 0,
  scopeKey: "",
  selectedDate: null,
  dayDetails: null,
  loadingDayDetails: false,
  dayDetailsError: null,
};

export function collectionDailyDayDetailsReducer(
  state: CollectionDailyDayDetailsState,
  action: DayDetailsAction,
): CollectionDailyDayDetailsState {
  if (action.requestId < state.requestId) return state;
  if (action.type === "clear") {
    return { ...initialCollectionDailyDayDetailsState, requestId: action.requestId };
  }
  if (action.type === "begin") {
    // Only pagination within the same date AND staff scope may keep its summary.
    const retainedDetails = state.scopeKey === action.scopeKey && state.selectedDate === action.date
      ? state.dayDetails
      : null;
    return {
      requestId: action.requestId,
      scopeKey: action.scopeKey,
      selectedDate: action.date,
      dayDetails: action.cachedDetails ?? retainedDetails,
      loadingDayDetails: !action.cachedDetails,
      dayDetailsError: null,
    };
  }
  if (action.requestId !== state.requestId || !state.selectedDate) return state;
  if (action.type === "success") {
    if (action.details.date !== state.selectedDate) return state;
    return { ...state, dayDetails: action.details, loadingDayDetails: false, dayDetailsError: null };
  }
  return { ...state, loadingDayDetails: false, dayDetailsError: action.message };
}
