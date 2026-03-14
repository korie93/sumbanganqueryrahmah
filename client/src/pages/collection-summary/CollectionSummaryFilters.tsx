import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionStaffNickname } from "@/lib/api";

interface CollectionSummaryFiltersProps {
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
        <div className="space-y-1">
          <Label>Staff Nickname (optional)</Label>
          <Popover open={nicknameDropdownOpen} onOpenChange={onNicknameDropdownOpenChange}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between" disabled={loading}>
                <span className="truncate text-left">{selectedNicknameLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] p-2">
              {visibleNicknameOptions.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  Tiada nickname tersedia untuk akaun anda.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        onCheckedChange={(checked) => {
                          if (checked === true) onSelectAllVisible();
                          else onClearAllSelected();
                        }}
                        disabled={loading}
                      />
                      <span className="text-xs font-medium">Select All</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onClearAllSelected}
                      disabled={selectedNicknamesCount === 0 || loading}
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    {visibleNicknameOptions.map((item) => {
                      const checked = selectedNicknameSet.has(item.nickname.toLowerCase());
                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(state) => onToggleNickname(item.nickname, state === true)}
                            disabled={loading}
                          />
                          <span className="text-sm">{item.nickname}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
