import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";
import type { CollectionNicknameSummaryData } from "./collection-nickname-summary-page-shared";

type CollectionNicknameSummaryDesktopFiltersProps = {
  summaryData: CollectionNicknameSummaryData;
};

export function CollectionNicknameSummaryDesktopFilters({
  summaryData,
}: CollectionNicknameSummaryDesktopFiltersProps) {
  return (
    <div className="ops-toolbar" data-floating-ai-avoid="true">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto] xl:items-end">
        <CollectionNicknameMultiSelect
          label="Staff Nickname"
          open={summaryData.nicknameDropdownOpen}
          loading={summaryData.loadingNicknames || summaryData.loadingSummary}
          selectedLabel={summaryData.selectedNicknameLabel}
          options={summaryData.nicknameOptions}
          selectedNicknameSet={summaryData.selectedNicknameSet}
          allSelected={summaryData.allSelected}
          partiallySelected={summaryData.partiallySelected}
          selectedCount={summaryData.selectedNicknames.length}
          onOpenChange={summaryData.setNicknameDropdownOpen}
          onToggleNickname={summaryData.toggleNickname}
          onSelectAllVisible={summaryData.selectAllVisible}
          onClearAllSelected={summaryData.clearAllSelected}
        />

        <div className="space-y-1">
          <Label>From Date</Label>
          <DatePickerField
            value={summaryData.fromDate}
            onChange={summaryData.setFromDate}
            placeholder="Select from date..."
            ariaLabel="From Date"
            buttonTestId="collection-nickname-summary-from-date"
          />
        </div>

        <div className="space-y-1">
          <Label>To Date</Label>
          <DatePickerField
            value={summaryData.toDate}
            onChange={summaryData.setToDate}
            placeholder="Select to date..."
            ariaLabel="To Date"
            buttonTestId="collection-nickname-summary-to-date"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
          <Button
            onClick={() => void summaryData.apply()}
            disabled={summaryData.loadingSummary || summaryData.loadingNicknames}
          >
            {summaryData.loadingSummary ? "Loading..." : "Apply"}
          </Button>
          <Button
            variant="outline"
            onClick={summaryData.reset}
            disabled={summaryData.loadingSummary}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
