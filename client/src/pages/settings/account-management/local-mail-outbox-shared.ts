import type { DevMailOutboxPreview } from "@/pages/settings/types";
import type {
  DevMailOutboxPaginationState,
  DevMailOutboxQueryState,
} from "@/pages/settings/useSettingsDevMailOutbox";

export type LocalMailOutboxSectionProps = {
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  enabled: boolean;
  entries: DevMailOutboxPreview[];
  loading: boolean;
  pagination: DevMailOutboxPaginationState;
  query: DevMailOutboxQueryState;
  onClear: () => void;
  onDeleteEntry: (previewId: string) => void;
  onQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  onRefresh: () => void;
};

export const LOCAL_MAIL_OUTBOX_SORT_OPTIONS: Array<{
  value: DevMailOutboxQueryState["sortDirection"];
  label: string;
}> = [
  { value: "desc", label: "Newest first" },
  { value: "asc", label: "Oldest first" },
];
