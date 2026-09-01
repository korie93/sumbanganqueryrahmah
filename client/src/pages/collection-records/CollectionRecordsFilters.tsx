import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionSourceConfig, CollectionStaffNickname } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CollectionRecordsFiltersProps {
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  searchInput: string;
  nicknameFilter: string;
  sourceImportFilter: string;
  agingFilter: string;
  classificationFilter: string;
  sortValue: string;
  nicknameOptions: CollectionStaffNickname[];
  sourceOptions: CollectionSourceConfig[];
  loadingNicknames: boolean;
  loadingSources: boolean;
  loadingRecords: boolean;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearchInputChange: (value: string) => void;
  onNicknameFilterChange: (value: string) => void;
  onSourceImportFilterChange: (value: string) => void;
  onAgingFilterChange: (value: string) => void;
  onClassificationFilterChange: (value: string) => void;
  onSortValueChange: (value: string) => void;
  onFilter: () => void;
  onReset: () => void;
}

type AdvancedFiltersProps = Pick<
  CollectionRecordsFiltersProps,
  | "agingFilter"
  | "classificationFilter"
  | "loadingSources"
  | "onAgingFilterChange"
  | "onClassificationFilterChange"
  | "onSortValueChange"
  | "onSourceImportFilterChange"
  | "sortValue"
  | "sourceImportFilter"
  | "sourceOptions"
> & {
  mobile?: boolean;
};

function CollectionRecordsAdvancedFilters({
  sourceImportFilter,
  agingFilter,
  classificationFilter,
  sortValue,
  sourceOptions,
  loadingSources,
  onSourceImportFilterChange,
  onAgingFilterChange,
  onClassificationFilterChange,
  onSortValueChange,
  mobile = false,
}: AdvancedFiltersProps) {
  const triggerClassName = mobile ? "h-12 rounded-2xl bg-background" : "h-11 rounded-xl bg-background";

  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`collection-records-source-${mobile ? "mobile" : "desktop"}`}>Saved Source / Batch</Label>
        <Select value={sourceImportFilter} onValueChange={onSourceImportFilterChange} disabled={loadingSources}>
          <SelectTrigger
            id={`collection-records-source-${mobile ? "mobile" : "desktop"}`}
            className={triggerClassName}
          >
            <SelectValue placeholder={loadingSources ? "Memuatkan source..." : "Semua source"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua source</SelectItem>
            {sourceOptions.map((source) => (
              <SelectItem key={source.sourceImportId} value={source.sourceImportId}>
                {source.sourceImportName || source.sourceFilename} ({source.rowCount.toLocaleString("en-MY")} rows)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`collection-records-aging-${mobile ? "mobile" : "desktop"}`}>Aging</Label>
        <Select value={agingFilter} onValueChange={onAgingFilterChange}>
          <SelectTrigger id={`collection-records-aging-${mobile ? "mobile" : "desktop"}`} className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua aging</SelectItem>
            {(["D3", "D4", "D5", "D6"] as const).map((aging) => (
              <SelectItem key={aging} value={aging}>{aging}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`collection-records-classification-${mobile ? "mobile" : "desktop"}`}>Classification</Label>
        <Select value={classificationFilter} onValueChange={onClassificationFilterChange}>
          <SelectTrigger id={`collection-records-classification-${mobile ? "mobile" : "desktop"}`} className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua (CP + Abort CP)</SelectItem>
            <SelectItem value="cp">CP</SelectItem>
            <SelectItem value="abort_cp">Abort CP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`collection-records-sort-${mobile ? "mobile" : "desktop"}`}>Susunan</Label>
        <Select value={sortValue} onValueChange={onSortValueChange}>
          <SelectTrigger id={`collection-records-sort-${mobile ? "mobile" : "desktop"}`} className={triggerClassName}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paymentDate_desc">Tarikh bayaran: terbaru</SelectItem>
            <SelectItem value="paymentDate_asc">Tarikh bayaran: terlama</SelectItem>
            <SelectItem value="amount_desc">Jumlah: tertinggi</SelectItem>
            <SelectItem value="amount_asc">Jumlah: terendah</SelectItem>
            <SelectItem value="source_asc">Source: A-Z</SelectItem>
            <SelectItem value="aging_asc">Aging: D3-D6</SelectItem>
            <SelectItem value="classification_asc">Classification: A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function CollectionRecordsFilters({
  canUseNicknameFilter,
  fromDate,
  toDate,
  searchInput,
  nicknameFilter,
  sourceImportFilter,
  agingFilter,
  classificationFilter,
  sortValue,
  nicknameOptions,
  sourceOptions,
  loadingNicknames,
  loadingSources,
  loadingRecords,
  onFromDateChange,
  onToDateChange,
  onSearchInputChange,
  onNicknameFilterChange,
  onSourceImportFilterChange,
  onAgingFilterChange,
  onClassificationFilterChange,
  onSortValueChange,
  onFilter,
  onReset,
}: CollectionRecordsFiltersProps) {
  const isMobile = useIsMobile();
  const [desktopNicknamePickerOpen, setDesktopNicknamePickerOpen] = useState(false);
  const [mobileNicknamePickerOpen, setMobileNicknamePickerOpen] = useState(false);
  const mobileFromDateButtonId = "collection-records-from-date-mobile-button";
  const mobileToDateButtonId = "collection-records-to-date-mobile-button";
  const desktopFromDateButtonId = "collection-records-from-date-button";
  const desktopToDateButtonId = "collection-records-to-date-button";
  const nicknameOptionsList = useMemo(
    () =>
      nicknameOptions
        .filter((item) => item.isActive)
        .map((item) => item.nickname),
    [nicknameOptions],
  );
  const selectedNicknameLabel = nicknameFilter === "all" ? "Semua staff" : nicknameFilter;

  if (isMobile) {
    return (
      <div className="space-y-4 rounded-[1.5rem] border border-border/60 bg-background p-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor={mobileFromDateButtonId}>From Date</Label>
          <DatePickerField
            buttonId={mobileFromDateButtonId}
            value={fromDate}
            onChange={onFromDateChange}
            placeholder="Select from date..."
            ariaLabel="From Date"
            buttonTestId="collection-records-from-date"
            className="h-12 rounded-2xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={mobileToDateButtonId}>To Date</Label>
          <DatePickerField
            buttonId={mobileToDateButtonId}
            value={toDate}
            onChange={onToDateChange}
            placeholder="Select to date..."
            ariaLabel="To Date"
            buttonTestId="collection-records-to-date"
            className="h-12 rounded-2xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="collection-records-search-mobile">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="collection-records-search-mobile"
              name="collectionRecordsSearchMobile"
              type="search"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder="Cari nama / IC / akaun / batch / telefon / jumlah bayaran"
              className="h-12 rounded-2xl pl-9 text-base"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        {canUseNicknameFilter ? (
          <CollectionNicknameSingleSelect
            label="Staff Nickname (optional)"
            triggerId="collection-records-nickname-filter-mobile"
            open={mobileNicknamePickerOpen}
            loading={loadingNicknames}
            selectedLabel={selectedNicknameLabel}
            options={nicknameOptionsList}
            value={nicknameFilter === "all" ? "" : nicknameFilter}
            emptySelectionLabel="Semua staff"
            emptySelectionActive={nicknameFilter === "all"}
            searchPlaceholder="Cari nickname staff..."
            onOpenChange={setMobileNicknamePickerOpen}
            onSelectEmpty={() => onNicknameFilterChange("all")}
            onSelect={onNicknameFilterChange}
            triggerClassName="h-12 rounded-2xl bg-background text-sm"
            popoverClassName="w-[min(360px,calc(100vw-2rem))] rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
          />
        ) : null}

        <CollectionRecordsAdvancedFilters
          mobile
          sourceImportFilter={sourceImportFilter}
          agingFilter={agingFilter}
          classificationFilter={classificationFilter}
          sortValue={sortValue}
          sourceOptions={sourceOptions}
          loadingSources={loadingSources}
          onSourceImportFilterChange={onSourceImportFilterChange}
          onAgingFilterChange={onAgingFilterChange}
          onClassificationFilterChange={onClassificationFilterChange}
          onSortValueChange={onSortValueChange}
        />

        <div className="grid grid-cols-2 gap-2 pt-1" data-floating-ai-avoid="true">
          <Button type="button" className="h-12 w-full rounded-2xl" onClick={onFilter} disabled={loadingRecords}>
            Filter
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-2xl"
            onClick={onReset}
            disabled={loadingRecords}
          >
            Reset
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`grid gap-3 ${
          canUseNicknameFilter
            ? "2xl:grid-cols-[minmax(170px,190px)_minmax(170px,190px)_minmax(280px,1fr)_minmax(220px,240px)_auto_auto]"
            : "xl:grid-cols-[minmax(170px,190px)_minmax(170px,190px)_minmax(280px,1fr)_auto_auto]"
        }`}
      >
      <div className="space-y-1.5">
        <Label htmlFor={desktopFromDateButtonId}>From Date</Label>
        <DatePickerField
          buttonId={desktopFromDateButtonId}
          value={fromDate}
          onChange={onFromDateChange}
          placeholder="Select from date..."
          ariaLabel="From Date"
          buttonTestId="collection-records-from-date"
          className="h-11 rounded-xl bg-background"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={desktopToDateButtonId}>To Date</Label>
        <DatePickerField
          buttonId={desktopToDateButtonId}
          value={toDate}
          onChange={onToDateChange}
          placeholder="Select to date..."
          ariaLabel="To Date"
          buttonTestId="collection-records-to-date"
          className="h-11 rounded-xl bg-background"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="collection-records-search">Search</Label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="collection-records-search"
            name="collectionRecordsSearch"
            type="search"
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Cari nama / IC / akaun / batch / telefon / jumlah bayaran"
            className="h-11 rounded-xl bg-background pl-9"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>
      {canUseNicknameFilter ? (
        <CollectionNicknameSingleSelect
          label="Staff Nickname (optional)"
          triggerId="collection-records-nickname-filter"
          open={desktopNicknamePickerOpen}
          loading={loadingNicknames}
          selectedLabel={selectedNicknameLabel}
          options={nicknameOptionsList}
          value={nicknameFilter === "all" ? "" : nicknameFilter}
          emptySelectionLabel="Semua staff"
          emptySelectionActive={nicknameFilter === "all"}
          searchPlaceholder="Cari nickname staff..."
          onOpenChange={setDesktopNicknamePickerOpen}
          onSelectEmpty={() => onNicknameFilterChange("all")}
          onSelect={onNicknameFilterChange}
          triggerClassName="h-11 rounded-xl bg-background text-sm"
          popoverClassName="w-[min(360px,calc(100vw-3rem))] rounded-2xl border-border/70 bg-popover p-2 shadow-xl"
        />
      ) : null}
      <div className={cn("flex items-end", canUseNicknameFilter ? "" : "xl:justify-end")} data-floating-ai-avoid="true">
        <Button type="button" className="h-11 rounded-xl px-5" onClick={onFilter} disabled={loadingRecords}>
          Filter
        </Button>
      </div>
      <div className="flex items-end" data-floating-ai-avoid="true">
        <Button type="button" variant="outline" className="h-11 rounded-xl px-5" onClick={onReset} disabled={loadingRecords}>
          Reset
        </Button>
      </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CollectionRecordsAdvancedFilters
          sourceImportFilter={sourceImportFilter}
          agingFilter={agingFilter}
          classificationFilter={classificationFilter}
          sortValue={sortValue}
          sourceOptions={sourceOptions}
          loadingSources={loadingSources}
          onSourceImportFilterChange={onSourceImportFilterChange}
          onAgingFilterChange={onAgingFilterChange}
          onClassificationFilterChange={onClassificationFilterChange}
          onSortValueChange={onSortValueChange}
        />
      </div>
    </div>
  );
}
