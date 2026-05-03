import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionStaffNickname } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CollectionNicknameSingleSelect } from "@/pages/collection-report/CollectionNicknameSingleSelect";

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
  );
}
