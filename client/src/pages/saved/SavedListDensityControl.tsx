import { Rows2, Rows4 } from "lucide-react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { SavedListDensity } from "@/pages/saved/useSavedListDensity";

type SavedListDensityControlProps = {
  value: SavedListDensity;
  onChange: (density: SavedListDensity) => void;
};

export function SavedListDensityControl({
  value,
  onChange,
}: SavedListDensityControlProps) {
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
      className="hidden shrink-0 rounded-lg border border-border/70 bg-muted/30 p-1 md:flex"
      aria-label="Saved file density"
      data-testid="saved-density-control"
    >
      <ToggleGroupItem
        value="comfortable"
        className="h-8 min-w-8 border-0 px-2 text-xs"
        aria-label="Comfortable saved file view"
        title="Comfortable view"
        data-testid="button-density-comfortable"
      >
        <Rows2 aria-hidden="true" />
        <span className="hidden 2xl:inline">Comfortable</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="compact"
        className="h-8 min-w-8 border-0 px-2 text-xs"
        aria-label="Compact saved file view"
        title="Compact view"
        data-testid="button-density-compact"
      >
        <Rows4 aria-hidden="true" />
        <span className="hidden 2xl:inline">Compact</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
