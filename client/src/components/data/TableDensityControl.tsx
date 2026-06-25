import { Rows2, Rows4 } from "lucide-react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";

type TableDensityControlProps = {
  ariaLabel: string;
  testIdPrefix: string;
  value: TableDensity;
  onChange: (density: TableDensity) => void;
};

/** Renders a persisted table-row spacing choice for desktop data surfaces. */
export function TableDensityControl({
  ariaLabel,
  testIdPrefix,
  value,
  onChange,
}: TableDensityControlProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "comfortable" || nextValue === "compact") {
          onChange(nextValue);
        }
      }}
      variant="outline"
      size="sm"
      className="hidden shrink-0 rounded-lg border border-border/70 bg-background p-1 md:flex"
      aria-label={ariaLabel}
      data-testid={`${testIdPrefix}-density-control`}
    >
      <ToggleGroupItem
        value="comfortable"
        className="h-8 min-w-8 border-0 px-2 text-xs"
        aria-label="Comfortable row spacing"
        title="Comfortable row spacing"
        data-testid={`${testIdPrefix}-density-comfortable`}
      >
        <Rows2 aria-hidden="true" />
        <span className="hidden 2xl:inline">Comfortable</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="compact"
        className="h-8 min-w-8 border-0 px-2 text-xs"
        aria-label="Compact row spacing"
        title="Compact row spacing"
        data-testid={`${testIdPrefix}-density-compact`}
      >
        <Rows4 aria-hidden="true" />
        <span className="hidden 2xl:inline">Compact</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
