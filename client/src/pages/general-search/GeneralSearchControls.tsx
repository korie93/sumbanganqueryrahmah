import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchDesktopControls } from "@/pages/general-search/GeneralSearchDesktopControls";
import { GeneralSearchMobileControls } from "@/pages/general-search/GeneralSearchMobileControls";
import type { FilterRow } from "@/pages/general-search/types";

interface GeneralSearchControlsProps {
  activeFilterSummaries: string[];
  activeFiltersCount: number;
  advancedMode: boolean;
  columns: string[];
  error: string;
  filters: FilterRow[];
  loading: boolean;
  loadingColumns: boolean;
  logic: "AND" | "OR";
  query: string;
  onAddFilter: () => void;
  onLogicChange: (value: "AND" | "OR") => void;
  onModeChange: (value: boolean) => void;
  onQueryChange: (value: string) => void;
  onRemoveFilter: (id: string) => void;
  onReset: () => void;
  onSearch: () => void;
  onUpdateFilter: (id: string, updates: Partial<FilterRow>) => void;
}

export function GeneralSearchControls(props: GeneralSearchControlsProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <GeneralSearchMobileControls {...props} />;
  }

  return <GeneralSearchDesktopControls {...props} />;
}
