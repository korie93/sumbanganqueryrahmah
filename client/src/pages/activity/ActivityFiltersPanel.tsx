import { Calendar, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import type { ActivityFilters } from "@/lib/api";
import { STATUS_OPTIONS } from "@/pages/activity/types";

interface ActivityFiltersPanelProps {
  dateFromOpen: boolean;
  dateToOpen: boolean;
  filters: ActivityFilters;
  onApply: () => void;
  onClear: () => void;
  onDateFromOpenChange: (open: boolean) => void;
  onDateToOpenChange: (open: boolean) => void;
  onFieldChange: (field: keyof ActivityFilters, value: string) => void;
  onToggleStatus: (status: (typeof STATUS_OPTIONS)[number]["value"]) => void;
}

export function ActivityFiltersPanel({
  dateFromOpen,
  dateToOpen,
  filters,
  onApply,
  onClear,
  onDateFromOpenChange,
  onDateToOpenChange,
  onFieldChange,
  onToggleStatus,
}: ActivityFiltersPanelProps) {
  return (
    <Card className="mb-6 glass-wrapper border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Filter Activity Logs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-sm font-medium mb-2 block">Status</Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={`status-${option.value}`}
                  checked={filters.status?.includes(option.value)}
                  onCheckedChange={() => onToggleStatus(option.value)}
                  data-testid={`checkbox-status-${option.value.toLowerCase()}`}
                />
                <Label htmlFor={`status-${option.value}`} className="text-sm cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="filter-username" className="text-sm font-medium mb-2 block">Username</Label>
            <Input
              id="filter-username"
              placeholder="Search username..."
              value={filters.username || ""}
              onChange={(event) => onFieldChange("username", event.target.value)}
              data-testid="input-filter-username"
            />
          </div>
          <div>
            <Label htmlFor="filter-ip" className="text-sm font-medium mb-2 block">IP Address</Label>
            <Input
              id="filter-ip"
              placeholder="Search IP..."
              value={filters.ipAddress || ""}
              onChange={(event) => onFieldChange("ipAddress", event.target.value)}
              data-testid="input-filter-ip"
            />
          </div>
          <div>
            <Label htmlFor="filter-browser" className="text-sm font-medium mb-2 block">Browser</Label>
            <Input
              id="filter-browser"
              placeholder="Search browser..."
              value={filters.browser || ""}
              onChange={(event) => onFieldChange("browser", event.target.value)}
              data-testid="input-filter-browser"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Start Date</Label>
            <Popover open={dateFromOpen} onOpenChange={onDateFromOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-date-from">
                  <Calendar className="w-4 h-4 mr-2" />
                  {filters.dateFrom ? format(new Date(`${filters.dateFrom}T12:00:00`), "dd MMM yyyy") : "Select date..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filters.dateFrom ? new Date(`${filters.dateFrom}T12:00:00`) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, "0");
                      const day = String(date.getDate()).padStart(2, "0");
                      onFieldChange("dateFrom", `${year}-${month}-${day}`);
                    } else {
                      onFieldChange("dateFrom", "");
                    }
                    onDateFromOpenChange(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">End Date</Label>
            <Popover open={dateToOpen} onOpenChange={onDateToOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-date-to">
                  <Calendar className="w-4 h-4 mr-2" />
                  {filters.dateTo ? format(new Date(`${filters.dateTo}T12:00:00`), "dd MMM yyyy") : "Select date..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={filters.dateTo ? new Date(`${filters.dateTo}T12:00:00`) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, "0");
                      const day = String(date.getDate()).padStart(2, "0");
                      onFieldChange("dateTo", `${year}-${month}-${day}`);
                    } else {
                      onFieldChange("dateTo", "");
                    }
                    onDateToOpenChange(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap pt-2">
          <Button onClick={onApply} data-testid="button-apply-filters">
            <Filter className="w-4 h-4 mr-2" />
            Apply Filter
          </Button>
          <Button variant="outline" onClick={onClear} data-testid="button-clear-filters">
            <X className="w-4 h-4 mr-2" />
            Reset Filter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
