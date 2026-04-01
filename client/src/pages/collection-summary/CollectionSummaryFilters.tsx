import { Suspense, lazy } from "react";
import { Label } from "@/components/ui/label";
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
          value={selectedYear}
          onChange={(event) => onSelectedYearChange(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              <Label>Staff Nickname (optional)</Label>
              <div className="h-10 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
            </div>
          }
        >
          <CollectionNicknameMultiSelect
            label="Staff Nickname (optional)"
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
          />
        </Suspense>
      ) : null}
    </div>
  );
}
