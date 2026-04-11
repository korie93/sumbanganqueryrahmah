import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActiveFilterChip = {
  id: string;
  label: string;
  onRemove?: (() => void) | undefined;
  tone?: "default" | "warning" | "danger" | undefined;
};

type ActiveFilterChipsProps = {
  items: ActiveFilterChip[];
  onClearAll?: (() => void) | undefined;
  label?: string | undefined;
  className?: string | undefined;
};

function resolveChipToneClassName(tone: ActiveFilterChip["tone"]) {
  if (tone === "danger") {
    return "border-destructive/35 bg-destructive/8 text-destructive";
  }
  if (tone === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  }
  return "border-border/70 bg-background/80 text-foreground";
}

export function ActiveFilterChips({
  items,
  onClearAll,
  label = "Active filters",
  className,
}: ActiveFilterChipsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {items.map((item) => (
        <span
          key={item.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
            resolveChipToneClassName(item.tone),
          )}
        >
          <span className="max-w-[240px] truncate">{item.label}</span>
          {item.onRemove ? (
            <button
              type="button"
              onClick={item.onRemove}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={`Remove filter ${item.label}`}
              title={`Remove filter ${item.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {onClearAll ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="h-7 px-2 text-xs">
          Clear all
        </Button>
      ) : null}
    </div>
  );
}
