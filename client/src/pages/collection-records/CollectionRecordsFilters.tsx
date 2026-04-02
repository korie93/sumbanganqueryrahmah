import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionStaffNickname } from "@/lib/api";

export interface CollectionRecordsFiltersProps {
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  searchInput: string;
  nicknameFilter: string;
  nicknameOptions: CollectionStaffNickname[];
  loadingNicknames: boolean;
  loadingRecords: boolean;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearchInputChange: (value: string) => void;
  onNicknameFilterChange: (value: string) => void;
  onFilter: () => void;
  onReset: () => void;
}

export function CollectionRecordsFilters({
  canUseNicknameFilter,
  fromDate,
  toDate,
  searchInput,
  nicknameFilter,
  nicknameOptions,
  loadingNicknames,
  loadingRecords,
  onFromDateChange,
  onToDateChange,
  onSearchInputChange,
  onNicknameFilterChange,
  onFilter,
  onReset,
}: CollectionRecordsFiltersProps) {
  return (
    <div
      className={`grid gap-3 ${
        canUseNicknameFilter
          ? "xl:grid-cols-[170px_170px_minmax(260px,1fr)_190px_auto_auto]"
          : "xl:grid-cols-[170px_170px_minmax(260px,1fr)_auto_auto]"
      }`}
    >
      <div className="space-y-1">
        <Label>From Date</Label>
        <DatePickerField
          value={fromDate}
          onChange={onFromDateChange}
          placeholder="Select from date..."
          ariaLabel="From Date"
          buttonTestId="collection-records-from-date"
        />
      </div>
      <div className="space-y-1">
        <Label>To Date</Label>
        <DatePickerField
          value={toDate}
          onChange={onToDateChange}
          placeholder="Select to date..."
          ariaLabel="To Date"
          buttonTestId="collection-records-to-date"
        />
      </div>
      <div className="space-y-1">
        <Label>Search</Label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Cari nama / IC / akaun / batch / telefon / jumlah bayaran"
            className="pl-9"
          />
        </div>
      </div>
      {canUseNicknameFilter ? (
        <div className="space-y-1">
          <Label htmlFor="collection-records-nickname-filter">Staff Nickname (optional)</Label>
          <select
            id="collection-records-nickname-filter"
            value={nicknameFilter}
            onChange={(event) => onNicknameFilterChange(event.target.value)}
            disabled={loadingNicknames}
            aria-label="Staff Nickname (optional)"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Semua staff</option>
              {nicknameOptions
                .filter((item) => item.isActive)
                .map((item) => (
                  <option key={item.id} value={item.nickname}>
                    {item.nickname}
                  </option>
                ))}
          </select>
        </div>
      ) : null}
      <div className="flex items-end">
        <Button variant="outline" onClick={onFilter} disabled={loadingRecords}>
          Filter
        </Button>
      </div>
      <div className="flex items-end">
        <Button variant="ghost" onClick={onReset} disabled={loadingRecords}>
          Reset
        </Button>
      </div>
    </div>
  );
}
