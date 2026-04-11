import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActivityFilters } from "@/lib/api";

type ActivityTextFiltersGridProps = {
  filters: ActivityFilters;
  onFieldChange: (field: keyof ActivityFilters, value: string) => void;
};

export function ActivityTextFiltersGrid({
  filters,
  onFieldChange,
}: ActivityTextFiltersGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label htmlFor="filter-username" className="mb-2 block text-sm font-medium">
          Username
        </Label>
        <Input
          id="filter-username"
          name="activityFilterUsername"
          type="search"
          placeholder="Search username..."
          value={filters.username || ""}
          onChange={(event) => onFieldChange("username", event.target.value)}
          autoComplete="off"
          data-testid="input-filter-username"
        />
      </div>
      <div>
        <Label htmlFor="filter-ip" className="mb-2 block text-sm font-medium">
          IP Address
        </Label>
        <Input
          id="filter-ip"
          name="activityFilterIpAddress"
          type="search"
          placeholder="Search IP..."
          value={filters.ipAddress || ""}
          onChange={(event) => onFieldChange("ipAddress", event.target.value)}
          autoComplete="off"
          data-testid="input-filter-ip"
        />
      </div>
      <div>
        <Label htmlFor="filter-browser" className="mb-2 block text-sm font-medium">
          Browser
        </Label>
        <Input
          id="filter-browser"
          name="activityFilterBrowser"
          type="search"
          placeholder="Search browser..."
          value={filters.browser || ""}
          onChange={(event) => onFieldChange("browser", event.target.value)}
          autoComplete="off"
          data-testid="input-filter-browser"
        />
      </div>
    </div>
  );
}
