import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type MobileActionMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  destructive?: boolean;
};

type MobileActionMenuProps = {
  items: MobileActionMenuItem[];
  triggerLabel?: string;
  contentLabel?: string;
  className?: string;
  align?: "start" | "center" | "end";
};

export function MobileActionMenu({
  items,
  triggerLabel = "More actions",
  contentLabel,
  className,
  align = "end",
}: MobileActionMenuProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("h-10 w-10 shrink-0 md:hidden", className)}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[min(18rem,calc(100vw-1.5rem))] rounded-xl p-2"
      >
        {contentLabel ? (
          <>
            <DropdownMenuLabel className="px-2 pb-2 pt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {contentLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              onSelect={() => {
                if (!item.disabled) {
                  item.onSelect();
                }
              }}
              className={cn(
                "gap-3 rounded-lg px-3 py-3 text-sm",
                item.destructive
                  ? "text-destructive focus:text-destructive"
                  : "",
              )}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              <span className="min-w-0 flex-1">{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
