import { lazy, memo, Suspense } from "react";
import { CollectionReportFreshnessBadge } from "@/components/collection-report/CollectionReportFreshnessBadge";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCollectionNicknameSummaryData } from "@/pages/collection-nickname-summary/useCollectionNicknameSummaryData";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";

const CollectionNicknameBatchSections = lazy(() =>
  import("@/pages/collection-nickname-summary/CollectionNicknameBatchSections").then((module) => ({
    default: module.CollectionNicknameBatchSections,
  })),
);

type CollectionNicknameSummaryPageProps = {
  role: string;
};

function CollectionNicknameSummaryIdleState() {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Pilih staff nickname dan julat tarikh, kemudian tekan Apply untuk lihat ringkasan kutipan.
    </div>
  );
}

function CollectionNicknameSummaryLoadingState() {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Loading nickname summary...
    </div>
  );
}

function CollectionNicknameSummaryPage({ role }: CollectionNicknameSummaryPageProps) {
  const canAccess = role === "admin" || role === "superuser";
  const isMobile = useIsMobile();
  const summaryData = useCollectionNicknameSummaryData({ canAccess });

  if (!canAccess) {
    return (
      <OperationalSectionCard contentClassName="py-10 text-center text-sm text-muted-foreground">
          Nickname Summary hanya tersedia untuk admin dan superuser.
      </OperationalSectionCard>
    );
  }

  return (
    <OperationalSectionCard
      title="Nickname Summary"
      description={summaryData.freshness?.message || "Compare selected staff nicknames over a chosen date range."}
      badge={<CollectionReportFreshnessBadge freshness={summaryData.freshness} />}
      contentClassName="space-y-4"
    >
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
            <Input
              type="date"
              value={summaryData.fromDate}
              onChange={(event) => summaryData.setFromDate(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>To Date</Label>
            <Input
              type="date"
              value={summaryData.toDate}
              onChange={(event) => summaryData.setToDate(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
            <Button
              onClick={() => void summaryData.apply()}
              disabled={summaryData.loadingSummary || summaryData.loadingNicknames}
              className={isMobile ? "w-full" : undefined}
            >
              {summaryData.loadingSummary ? "Loading..." : "Apply"}
            </Button>
            <Button
              variant="outline"
              onClick={summaryData.reset}
              disabled={summaryData.loadingSummary}
              className={isMobile ? "w-full" : undefined}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {summaryData.hasApplied || summaryData.loadingSummary ? (
        <Suspense fallback={<CollectionNicknameSummaryLoadingState />}>
          <CollectionNicknameBatchSections
            loading={summaryData.loadingSummary}
            hasApplied={summaryData.hasApplied}
            selectedNicknames={summaryData.selectedNicknames}
            fromDate={summaryData.fromDate}
            toDate={summaryData.toDate}
            totalAmount={summaryData.totalAmount}
            totalRecords={summaryData.totalRecords}
            nicknameTotals={summaryData.nicknameTotals}
          />
        </Suspense>
      ) : (
        <CollectionNicknameSummaryIdleState />
      )}
    </OperationalSectionCard>
  );
}

export default memo(CollectionNicknameSummaryPage);
