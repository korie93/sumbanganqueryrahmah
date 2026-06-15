import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";
import { Maximize2 } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CollectionNicknameSummaryChartContentProps } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";

const CollectionNicknameSummaryChartContent = lazy(() =>
  import("@/pages/collection-nickname-summary/CollectionNicknameSummaryChartContent").then(
    (module) => ({
      default: module.CollectionNicknameSummaryChartContent,
    }),
  ),
);

type CollectionNicknameSummaryChartProps = CollectionNicknameSummaryChartContentProps & {
  fromDate: string;
  toDate: string;
};

function CollectionNicknameSummaryChartFallback() {
  return (
    <div
      className="min-h-[320px] rounded-lg border border-border/60 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground sm:min-h-[360px]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      Loading nickname summary chart...
    </div>
  );
}

export function CollectionNicknameSummaryChart({
  fromDate,
  toDate,
  ...contentProps
}: CollectionNicknameSummaryChartProps) {
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const fullViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dateRange =
    fromDate && toDate
      ? `${formatIsoDateToDDMMYYYY(fromDate)} - ${formatIsoDateToDDMMYYYY(toDate)}`
      : "Selected date range";
  const openFullView = useCallback<MouseEventHandler<HTMLButtonElement>>((event) => {
    fullViewTriggerRef.current = event.currentTarget;
    setFullViewOpen(true);
  }, []);
  const handleFullViewOpenChange = useCallback((open: boolean) => {
    setFullViewOpen(open);
  }, []);
  const handleFullViewCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    fullViewTriggerRef.current?.focus();
    fullViewTriggerRef.current = null;
  }, []);

  return (
    <>
      <OperationalSectionCard
        title="Nickname Summary Chart"
        description={`Perbandingan jumlah kutipan mengikut nickname bagi ${dateRange}.`}
        actions={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            aria-label="Buka graf nickname summary dalam paparan penuh"
            aria-haspopup="dialog"
            onClick={openFullView}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            Paparan penuh
          </Button>
        )}
        className="min-w-0"
        contentClassName="min-w-0"
      >
        <Suspense fallback={<CollectionNicknameSummaryChartFallback />}>
          <CollectionNicknameSummaryChartContent
            {...contentProps}
            displayMode="compact"
            fromDate={fromDate}
            toDate={toDate}
          />
        </Suspense>
      </OperationalSectionCard>

      <Dialog open={fullViewOpen} onOpenChange={handleFullViewOpenChange}>
        <DialogContent
          className="h-[calc(var(--viewport-min-height-value)-1rem)] w-[calc(100vw-1rem)] max-w-[96rem] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden p-4 sm:h-[calc(var(--viewport-min-height-value)-2rem)] sm:w-[calc(100vw-2rem)] sm:p-5"
          data-testid="dialog-nickname-summary-chart-detail"
          data-floating-ai-avoid="true"
          onCloseAutoFocus={handleFullViewCloseAutoFocus}
        >
          <DialogHeader className="pr-9 text-left">
            <DialogTitle className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5" aria-hidden="true" />
              Nickname Summary Detail
            </DialogTitle>
            <DialogDescription>
              Semak graf, ranking, jumlah, rekod, purata dan peratus sumbangan setiap nickname bagi {dateRange}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <Suspense fallback={<CollectionNicknameSummaryChartFallback />}>
              <CollectionNicknameSummaryChartContent
                {...contentProps}
                displayMode="detail"
                fromDate={fromDate}
                toDate={toDate}
              />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
