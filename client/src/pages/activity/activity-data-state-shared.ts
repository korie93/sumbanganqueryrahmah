import type { MutableRefObject } from "react";
import type { ActivityFilters } from "@/lib/api";

export type UseActivityDataStateOptions = {
  canModerateActivity: boolean;
};

export type UseActivityFeedStateOptions = {
  canModerateActivity: boolean;
  filtersRef: MutableRefObject<ActivityFilters>;
};
