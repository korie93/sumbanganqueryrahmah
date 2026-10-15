import { useState, type ReactNode } from "react";
import { Filter, Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import {
  LOCAL_MAIL_OUTBOX_SORT_OPTIONS,
} from "@/pages/settings/account-management/local-mail-outbox-shared";

type LocalMailOutboxFiltersPanelProps = {
  actions?: ReactNode;
  activeFilters: ActiveFilterChip[];
  emailQuery: string;
  hasActiveFilters: boolean;
  sortDirection: "asc" | "desc";
  subjectQuery: string;
  onClearAll: () => void;
  onEmailQueryChange: (value: string) => void;
  onSortDirectionChange: (value: string) => void;
  onSubjectQueryChange: (value: string) => void;
};

export function LocalMailOutboxFiltersPanel({
  actions,
  activeFilters,
  emailQuery,
  hasActiveFilters,
  sortDirection,
  subjectQuery,
  onClearAll,
  onEmailQueryChange,
  onSortDirectionChange,
  onSubjectQueryChange,
}: LocalMailOutboxFiltersPanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-2">
          <label htmlFor="local-mail-outbox-email-query" className="sr-only">Search by email</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="local-mail-outbox-email-query"
              name="localMailOutboxEmailQuery"
              type="search"
              value={emailQuery}
              onChange={(event) => onEmailQueryChange(event.target.value)}
              placeholder="Filter recipient email"
              className="pl-9"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        <Button type="button" variant="outline" {...getAriaExpandedProps(filtersOpen)} aria-controls="local-mail-outbox-filters" onClick={() => setFiltersOpen((open) => !open)}>
          <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
          Filter
        </Button>
        {actions}
      </div>
      {filtersOpen ? (
      <div id="local-mail-outbox-filters" className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="space-y-2">
          <label htmlFor="local-mail-outbox-subject-query" className="text-sm font-medium">Search by subject</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="local-mail-outbox-subject-query"
              name="localMailOutboxSubjectQuery"
              type="search"
              value={subjectQuery}
              onChange={(event) => onSubjectQueryChange(event.target.value)}
              placeholder="Filter email subject"
              className="pl-9"
              enterKeyHint="search"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label
            id="local-mail-outbox-sort-direction-label"
            htmlFor="local-mail-outbox-sort-direction"
            className="text-sm font-medium"
          >
            Sort by date
          </label>
          <select
            id="local-mail-outbox-sort-direction"
            name="localMailOutboxSortDirection"
            aria-label="Sort by date"
            aria-labelledby="local-mail-outbox-sort-direction-label"
            title="Sort by date"
            value={sortDirection}
            onChange={(event) => onSortDirectionChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {LOCAL_MAIL_OUTBOX_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      ) : null}
      <ActiveFilterChips
        items={activeFilters}
        onClearAll={hasActiveFilters ? onClearAll : undefined}
      />
    </div>
  );
}
