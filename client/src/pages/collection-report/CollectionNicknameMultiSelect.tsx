import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CollectionStaffNickname } from "@/lib/api";

type CollectionNicknameMultiSelectProps = {
  label: string;
  open: boolean;
  loading?: boolean;
  selectedLabel: string;
  options: CollectionStaffNickname[];
  selectedNicknameSet: Set<string>;
  allSelected: boolean;
  partiallySelected: boolean;
  selectedCount: number;
  onOpenChange: (open: boolean) => void;
  onToggleNickname: (nickname: string, checked: boolean) => void;
  onSelectAllVisible: () => void;
  onClearAllSelected: () => void;
};

export function CollectionNicknameMultiSelect({
  label,
  open,
  loading = false,
  selectedLabel,
  options,
  selectedNicknameSet,
  allSelected,
  partiallySelected,
  selectedCount,
  onOpenChange,
  onToggleNickname,
  onSelectAllVisible,
  onClearAllSelected,
}: CollectionNicknameMultiSelectProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between" disabled={loading}>
            <span className="truncate text-left">{selectedLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[340px] p-2">
          {options.length === 0 ? (
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
                  disabled={selectedCount === 0 || loading}
                >
                  Clear All
                </Button>
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {options.map((item) => {
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
  );
}
