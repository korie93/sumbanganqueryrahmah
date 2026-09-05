import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";

type CollectionNicknameSingleSelectProps = {
  label: string;
  triggerId?: string | undefined;
  open: boolean;
  loading?: boolean;
  disabled?: boolean;
  selectedLabel: string;
  options: string[];
  emptySelectionActive?: boolean | undefined;
  emptySelectionLabel?: string | undefined;
  value: string;
  emptyMessage?: string | undefined;
  searchPlaceholder?: string | undefined;
  onOpenChange: (open: boolean) => void;
  onSelectEmpty?: (() => void) | undefined;
  onSelect: (nickname: string) => void;
  triggerClassName?: string | undefined;
  popoverClassName?: string | undefined;
};

export function CollectionNicknameSingleSelect({
  label,
  triggerId,
  open,
  loading = false,
  disabled = false,
  selectedLabel,
  options,
  emptySelectionActive = false,
  emptySelectionLabel,
  value,
  emptyMessage = "Tiada nickname tersedia untuk akaun anda.",
  searchPlaceholder = "Cari nickname...",
  onOpenChange,
  onSelectEmpty,
  onSelect,
  triggerClassName,
  popoverClassName,
}: CollectionNicknameSingleSelectProps) {
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (!open) {
      setSearchValue("");
    }
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    if (!normalizedSearch) {
      return options;
    }
    return options.filter((nickname) => nickname.toLowerCase().includes(normalizedSearch));
  }, [options, searchValue]);

  return (
    <div className="space-y-1">
      <Label htmlFor={triggerId}>{label}</Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            className={cn("w-full justify-between", triggerClassName)}
            disabled={loading || disabled}
            aria-haspopup="dialog"
            {...getAriaExpandedProps(open)}
          >
            <span className="truncate text-left">{selectedLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn(
            "w-[min(340px,calc(100vw-2rem))] border-border/70 bg-popover p-2 text-popover-foreground shadow-lg",
            popoverClassName,
          )}
          data-floating-ai-avoid="true"
        >
          {options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-9"
                  aria-label={`${label} search`}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {emptySelectionLabel ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelectEmpty?.();
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      emptySelectionActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent/40",
                    )}
                  >
                    <span className="truncate">{emptySelectionLabel}</span>
                    {emptySelectionActive ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                ) : null}
                {filteredOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    Tiada nickname sepadan dengan carian ini.
                  </p>
                ) : (
                  filteredOptions.map((nickname) => {
                    const selected = nickname.toLowerCase() === value.trim().toLowerCase();
                    return (
                      <button
                        key={nickname}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onSelect(nickname);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors",
                          selected
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent/40",
                        )}
                      >
                        <span className="truncate">{nickname}</span>
                        {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
