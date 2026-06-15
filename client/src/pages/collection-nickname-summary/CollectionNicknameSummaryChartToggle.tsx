import { useId, useState } from "react";
import { BarChart3, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollectionNicknameSummaryChart } from "@/pages/collection-nickname-summary/CollectionNicknameSummaryChart";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";

type CollectionNicknameSummaryChartToggleProps = {
  fromDate: string;
  toDate: string;
  nicknameTotals: NicknameTotalSummary[];
  totalAmount: number;
  totalRecords: number;
};

export function CollectionNicknameSummaryChartToggle({
  fromDate,
  toDate,
  nicknameTotals,
  totalAmount,
  totalRecords,
}: CollectionNicknameSummaryChartToggleProps) {
  const [isChartVisible, setIsChartVisible] = useState(false);
  const chartRegionId = useId();

  if (nicknameTotals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3" data-floating-ai-avoid="true">
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Visual comparison</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Rekod total di atas ialah sumber utama. Buka graf hanya apabila perbandingan visual diperlukan.
          </p>
        </div>
        <Button
          type="button"
          variant={isChartVisible ? "outline" : "default"}
          className="shrink-0"
          aria-expanded={isChartVisible}
          aria-controls={chartRegionId}
          onClick={() => setIsChartVisible((current) => !current)}
        >
          {isChartVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{isChartVisible ? "Sembunyikan Graf" : "Lihat Graf Nickname Summary"}</span>
        </Button>
      </div>

      {isChartVisible ? (
        <div id={chartRegionId}>
          <CollectionNicknameSummaryChart
            fromDate={fromDate}
            toDate={toDate}
            nicknameTotals={nicknameTotals}
            totalAmount={totalAmount}
            totalRecords={totalRecords}
          />
        </div>
      ) : null}
    </div>
  );
}
