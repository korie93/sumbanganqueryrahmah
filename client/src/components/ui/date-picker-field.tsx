import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  buttonTestId?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function getSelectedDate(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toIsoDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = "Select date...",
  buttonTestId,
  ariaLabel,
  className,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
}: DatePickerFieldProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const selectedDate = getSelectedDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "h-10 w-full justify-start rounded-lg border-border/80 bg-background/95 text-left font-normal shadow-sm transition-colors hover:bg-accent/50 hover:text-foreground",
            value
              ? "border-primary/40 bg-primary/[0.06] text-foreground"
              : "text-muted-foreground",
            className,
          )}
          data-testid={buttonTestId}
        >
          <CalendarIcon
            className={cn("mr-2 h-4 w-4 shrink-0", value ? "text-primary" : "text-muted-foreground")}
          />
          <span className="truncate">
            {value ? formatIsoDateToDDMMYYYY(value) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-xl border border-border/80 bg-popover p-0 shadow-lg" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            onChange(date ? toIsoDateValue(date) : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
