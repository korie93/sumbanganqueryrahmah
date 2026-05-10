import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { normalizeCollectionMonthInputValue } from "./collection-monthly-comparison-utils";

type CollectionMonthFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function CollectionMonthField({
  id,
  label,
  value,
  onChange,
}: CollectionMonthFieldProps) {
  const [draftValue, setDraftValue] = useState(value);
  const helpId = `${id}-format`;
  const normalizedDraftValue = normalizeCollectionMonthInputValue(draftValue);
  const showInvalidState = draftValue.trim().length > 0 && !normalizedDraftValue;
  const invalidAriaAttributes = showInvalidState ? { "aria-invalid": true } : {};

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const commitDraftValue = (nextValue: string) => {
    const normalized = normalizeCollectionMonthInputValue(nextValue);
    if (normalized) {
      setDraftValue(normalized);
      onChange(normalized);
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]{4}-[0-9]{1,2}"
        placeholder="YYYY-MM"
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);
          commitDraftValue(nextValue);
        }}
        onBlur={() => {
          if (!commitDraftValue(draftValue)) {
            setDraftValue(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !commitDraftValue(draftValue)) {
            setDraftValue(value);
          }
        }}
        aria-describedby={helpId}
        {...invalidAriaAttributes}
        title="Use YYYY-MM format, for example 2026-05"
        className={cn(
          "collection-monthly-comparison-control h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm",
          showInvalidState && "border-destructive text-destructive focus-visible:ring-destructive",
        )}
      />
      <span
        id={helpId}
        className={showInvalidState ? "text-[11px] font-medium text-destructive" : "sr-only"}
      >
        Use YYYY-MM format, for example 2026-05.
      </span>
    </div>
  );
}
