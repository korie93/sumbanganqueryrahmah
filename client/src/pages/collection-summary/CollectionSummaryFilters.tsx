import { Suspense, lazy } from "react";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionStaffNickname } from "@/lib/api";

const CollectionNicknameMultiSelect = lazy(() =>
  import("@/pages/collection-report/CollectionNicknameMultiSelect").then((module) => ({
    default: module.CollectionNicknameMultiSelect,
  })),
);

export interface CollectionSummaryFiltersProps {
  canFilterByNickname: boolean;
  selectedYear: string;
  yearOptions: number[];
  nicknameDropdownOpen: boolean;
  loading: boolean;
  visibleNicknameOptions: CollectionStaffNickname[];
  selectedNicknameSet: Set<string>;
  selectedNicknameLabel: string;
  allSelected: boolean;
  partiallySelected: boolean;
  selectedNicknamesCount: number;
  onSelectedYearChange: (value: string) => void;
  onNicknameDropdownOpenChange: (open: boolean) => void;
  onToggleNickname: (nickname: string, checked: boolean) => void;
  onSelectAllVisible: () => void;
  onClearAllSelected: () => void;
}

export function CollectionSummaryFilters({
  canFilterByNickname,
  selectedYear,
  yearOptions,
  nicknameDropdownOpen,
  loading,
  visibleNicknameOptions,
  selectedNicknameSet,
  selectedNicknameLabel,
  allSelected,
  partiallySelected,
  selectedNicknamesCount,
  onSelectedYearChange,
  onNicknameDropdownOpenChange,
  onToggleNickname,
  onSelectAllVisible,
  onClearAllSelected,
}: CollectionSummaryFiltersProps) {
  const isMobile = useIsMobile();
  const nicknameTriggerId = "collection-summary-nickname-filter";

  return (
    <div
      className={`grid gap-3 ${
        canFilterByNickname ? "lg:grid-cols-[220px_minmax(0,1fr)]" : "lg:grid-cols-[220px]"
      }`}
    >
      <div className="space-y-1">
        <Label htmlFor="collection-summary-year-filter">Year</Label>
        <select
          id="collection-summary-year-filter"
          name="collectionSummaryYear"
          value={selectedYear}
          onChange={(event) => onSelectedYearChange(event.target.value)}
          aria-label="Year"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
        >
          {yearOptions.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {canFilterByNickname ? (
        <Suspense
          fallback={
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none text-foreground">
                Staff Nickname (optional)
              </p>
              <div
                className="h-11 animate-pulse rounded-md border border-border bg-muted motion-reduce:animate-none md:h-9"
              />
            </div>
          }
        >
          <CollectionNicknameMultiSelect
            label="Staff Nickname (optional)"
            triggerId={nicknameTriggerId}
            open={nicknameDropdownOpen}
            loading={loading}
            selectedLabel={selectedNicknameLabel}
            options={visibleNicknameOptions}
            selectedNicknameSet={selectedNicknameSet}
            allSelected={allSelected}
            partiallySelected={partiallySelected}
            selectedCount={selectedNicknamesCount}
            onOpenChange={onNicknameDropdownOpenChange}
            onToggleNickname={onToggleNickname}
            onSelectAllVisible={onSelectAllVisible}
            onClearAllSelected={onClearAllSelected}
            triggerClassName="h-11 rounded-md bg-background md:h-9"
            popoverClassName={isMobile ? "w-[min(360px,calc(100vw-2rem))] rounded-xl border-border bg-popover" : undefined}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
