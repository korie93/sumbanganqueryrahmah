import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
          ? "xl:grid-cols-[170px_170px_minmax(260px,1fr)_220px_auto_auto]"
          : "xl:grid-cols-[170px_170px_minmax(260px,1fr)_auto_auto]"
      }`}
    >
      <div className="space-y-1">
        <Label>From Date</Label>
        <Input type="date" value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>To Date</Label>
        <Input type="date" value={toDate} onChange={(event) => onToDateChange(event.target.value)} />
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
          <Label>Staff Nickname (optional)</Label>
          <Select
            value={nicknameFilter}
            onValueChange={onNicknameFilterChange}
            disabled={loadingNicknames}
          >
            <SelectTrigger>
              <SelectValue placeholder="Semua staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua staff</SelectItem>
              {nicknameOptions
                .filter((item) => item.isActive)
                .map((item) => (
                  <SelectItem key={item.id} value={item.nickname}>
                    {item.nickname}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
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
