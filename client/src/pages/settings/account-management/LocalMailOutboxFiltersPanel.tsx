import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  LOCAL_MAIL_OUTBOX_SORT_OPTIONS,
} from "@/pages/settings/account-management/local-mail-outbox-shared";

type LocalMailOutboxFiltersPanelProps = {
  emailQuery: string;
  sortDirection: "asc" | "desc";
  subjectQuery: string;
  onEmailQueryChange: (value: string) => void;
  onSortDirectionChange: (value: string) => void;
  onSubjectQueryChange: (value: string) => void;
};

export function LocalMailOutboxFiltersPanel({
  emailQuery,
  sortDirection,
  subjectQuery,
  onEmailQueryChange,
  onSortDirectionChange,
  onSubjectQueryChange,
}: LocalMailOutboxFiltersPanelProps) {
  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_1fr_180px]">
      <div className="space-y-2">
        <p className="text-sm font-medium">Search by email</p>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="localMailOutboxEmailQuery"
            type="search"
            value={emailQuery}
            onChange={(event) => onEmailQueryChange(event.target.value)}
            aria-label="Search by email"
            placeholder="Filter recipient email"
            className="pl-9"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Search by subject</p>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="localMailOutboxSubjectQuery"
            type="search"
            value={subjectQuery}
            onChange={(event) => onSubjectQueryChange(event.target.value)}
            aria-label="Search by subject"
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
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {LOCAL_MAIL_OUTBOX_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
