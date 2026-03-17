import { Label } from "@/components/ui/label";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionStaffNickname } from "@/lib/api";

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
        <Label>Year</Label>
        <Select value={selectedYear} onValueChange={onSelectedYearChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canFilterByNickname ? (
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
      ) : null}
    </div>
  );
}
