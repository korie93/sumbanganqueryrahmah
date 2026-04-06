import type { PendingPasswordResetRequest } from "@/pages/settings/types";
import type {
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

export type PendingPasswordResetSectionProps = {
  loading: boolean;
  pagination: PendingResetRequestsPaginationState;
  query: PendingResetRequestsQueryState;
  onQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  onRefresh: () => void;
  requests: PendingPasswordResetRequest[];
};

export const PENDING_RESET_STATUS_OPTIONS: Array<{
  value: PendingResetRequestsQueryState["status"];
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "active" },
  { value: "pending_activation", label: "pending_activation" },
  { value: "suspended", label: "suspended" },
  { value: "disabled", label: "disabled" },
  { value: "locked", label: "locked" },
  { value: "banned", label: "banned" },
];
