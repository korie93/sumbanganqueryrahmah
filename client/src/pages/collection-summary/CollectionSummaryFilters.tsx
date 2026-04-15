import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionStaffNickname } from "@/lib/api";

const CollectionNicknameMultiSelect = lazyWithPreload(() =>
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
          className={`w-full border border-input bg-background px-3 text-sm ${
            isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md"
          }`}
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
                className={`animate-pulse border border-border/60 bg-muted/20 ${
                  isMobile ? "h-12 rounded-2xl" : "h-10 rounded-xl"
                }`}
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
            triggerClassName={isMobile ? "h-12 rounded-2xl bg-background/95" : undefined}
            popoverClassName={isMobile ? "w-[min(360px,calc(100vw-3rem))] rounded-2xl border-border/70 bg-popover/98 shadow-lg" : undefined}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
