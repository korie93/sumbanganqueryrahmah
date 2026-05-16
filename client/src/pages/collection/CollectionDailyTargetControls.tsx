import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

export type CollectionDailyTargetControlsProps = {
  monthlyTargetInput: string;
  onMonthlyTargetInputChange: (value: string) => void;
  canEditTarget: boolean;
  canEditCalendar: boolean;
  savingTarget: boolean;
  onSaveTarget: () => void;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
  calendarDays: EditableCalendarDay[];
};

export function CollectionDailyTargetControls({
  monthlyTargetInput,
  onMonthlyTargetInputChange,
  canEditTarget,
  canEditCalendar,
  savingTarget,
  onSaveTarget,
  savingCalendar,
  onSaveCalendar,
  calendarDays,
}: CollectionDailyTargetControlsProps) {
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "gap-3 border border-border/70 bg-background p-4 shadow-sm",
        isMobile ? "space-y-4 rounded-2xl" : "grid rounded-2xl md:grid-cols-[220px_auto] md:items-end",
      )}
    >
      <div className="space-y-1">
        <Label htmlFor="collection-daily-monthly-target">Monthly Target (RM)</Label>
        <Input
          id="collection-daily-monthly-target"
          name="collectionDailyMonthlyTarget"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={monthlyTargetInput}
          onChange={(event) => onMonthlyTargetInputChange(event.target.value)}
          disabled={!canEditTarget}
          className={isMobile ? "h-12 rounded-2xl bg-background" : "h-11 rounded-xl bg-background"}
        />
        {!canEditTarget ? (
          <p className="text-xs text-muted-foreground">
            Select exactly one staff nickname to edit monthly target.
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "gap-2",
          isMobile ? "grid sm:grid-cols-2" : "flex flex-col sm:flex-row sm:flex-wrap",
        )}
        data-floating-ai-avoid="true"
      >
        <Button
          type="button"
          className={cn("w-full", isMobile ? "h-12 rounded-2xl" : "h-11 rounded-xl sm:w-auto")}
          onClick={onSaveTarget}
          disabled={savingTarget || !canEditTarget}
        >
          {savingTarget ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Save Target
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full", isMobile ? "h-12 rounded-2xl" : "h-11 rounded-xl sm:w-auto")}
          onClick={onSaveCalendar}
          disabled={savingCalendar || !canEditCalendar || calendarDays.length === 0}
        >
          {savingCalendar ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Save Calendar
        </Button>
      </div>
      {!canEditCalendar ? (
        <p className={cn("text-xs text-muted-foreground", isMobile ? "sm:col-span-2" : "md:col-span-2")}>
          Superuser mesti pilih tepat satu staff nickname untuk simpan status Working, Holiday/Leave atau OFF.
        </p>
      ) : null}
    </div>
  );
}
