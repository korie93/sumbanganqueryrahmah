import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionStaffNickname } from "@/lib/api";
import type {
  CollectionRecordDuplicateFilter,
  CollectionRecordReviewFilter,
} from "@/pages/collection-records/types";

export interface CollectionRecordsFiltersProps {
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  searchInput: string;
  nicknameFilter: string;
  reviewFilter: CollectionRecordReviewFilter;
  duplicateFilter: CollectionRecordDuplicateFilter;
  nicknameOptions: CollectionStaffNickname[];
  loadingNicknames: boolean;
  loadingRecords: boolean;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearchInputChange: (value: string) => void;
  onNicknameFilterChange: (value: string) => void;
  onReviewFilterChange: (value: CollectionRecordReviewFilter) => void;
  onDuplicateFilterChange: (value: CollectionRecordDuplicateFilter) => void;
  onFilter: () => void;
  onReset: () => void;
}

export function CollectionRecordsFilters({
  canUseNicknameFilter,
  fromDate,
  toDate,
  searchInput,
  nicknameFilter,
  reviewFilter,
  duplicateFilter,
  nicknameOptions,
  loadingNicknames,
  loadingRecords,
  onFromDateChange,
  onToDateChange,
  onSearchInputChange,
  onNicknameFilterChange,
  onReviewFilterChange,
  onDuplicateFilterChange,
  onFilter,
  onReset,
}: CollectionRecordsFiltersProps) {
  return (
    <div
      className={`grid gap-3 ${
        canUseNicknameFilter
          ? "xl:grid-cols-[170px_170px_minmax(260px,1fr)_220px_220px_190px_auto_auto]"
          : "xl:grid-cols-[170px_170px_minmax(260px,1fr)_220px_190px_auto_auto]"
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
      <div className="space-y-1">
        <Label>Receipt Review</Label>
        <Select
          value={reviewFilter}
          onValueChange={(value) => onReviewFilterChange(value as CollectionRecordReviewFilter)}
          disabled={loadingRecords}
        >
          <SelectTrigger>
            <SelectValue placeholder="All records" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            <SelectItem value="flagged">Flagged only</SelectItem>
            <SelectItem value="underpaid">Underpaid</SelectItem>
            <SelectItem value="overpaid">Overpaid</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Duplicate Receipts</Label>
        <Select
          value={duplicateFilter}
          onValueChange={(value) => onDuplicateFilterChange(value as CollectionRecordDuplicateFilter)}
          disabled={loadingRecords}
        >
          <SelectTrigger>
            <SelectValue placeholder="All receipts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All receipts</SelectItem>
            <SelectItem value="duplicates">Duplicate warnings only</SelectItem>
          </SelectContent>
        </Select>
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
