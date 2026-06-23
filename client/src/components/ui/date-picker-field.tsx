import { useState, type FocusEventHandler } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar, type CalendarProps } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { cn } from "@/lib/utils";

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  buttonId?: string;
  buttonTestId?: string;
  ariaLabel?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  disabledDates?: CalendarProps["disabled"];
  required?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBlur?: FocusEventHandler<HTMLButtonElement> | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
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

/**
 * Renders the shared date picker field component used across SQR screens.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Select date...",
  buttonId,
  buttonTestId,
  ariaLabel,
  className,
  contentClassName,
  disabled = false,
  disabledDates,
  required = false,
  open: controlledOpen,
  onOpenChange,
  onBlur,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DatePickerFieldProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const selectedDate = getSelectedDate(value);
  const displayValue = value ? formatIsoDateToDDMMYYYY(value) : placeholder;
  const triggerLabel = ariaLabel ?? placeholder;
  const requiredLabel = required ? " required" : "";
  const triggerAccessibleLabel = ariaLabel
    ? `${ariaLabel}${requiredLabel}: ${displayValue}`
    : `${displayValue}${requiredLabel}`;
  const triggerAriaLabelProps = triggerAccessibleLabel ? { "aria-label": triggerAccessibleLabel } : {};
  const triggerDescribedByProps = ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {};
  const triggerInvalidProps = getAriaInvalidProps(ariaInvalid);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={buttonId}
          type="button"
          variant="outline"
          disabled={disabled}
          onBlur={onBlur}
          {...triggerAriaLabelProps}
          {...triggerDescribedByProps}
          {...triggerInvalidProps}
          title={triggerLabel}
          className={cn(
            "h-10 w-full justify-start rounded-lg border-border/80 bg-background/95 text-left font-normal shadow-sm transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
            value
              ? "border-primary/40 bg-primary/[0.06] text-foreground"
              : "text-muted-foreground",
            className,
          )}
          data-testid={buttonTestId}
        >
          <CalendarIcon
            className={cn("mr-2 h-4 w-4 shrink-0", value ? "text-primary" : "text-muted-foreground")}
            aria-hidden="true"
          />
          <span className="truncate">
            {displayValue}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-auto rounded-xl border border-border/80 bg-popover p-0 shadow-lg",
          contentClassName,
        )}
        align="start"
        data-floating-ai-avoid="true"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          disabled={disabledDates}
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
