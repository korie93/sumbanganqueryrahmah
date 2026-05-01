import { BarChart3, CalendarRange, TrendingUp } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { getCollectionNicknames, type CollectionStaffNickname } from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import { CollectionMonthlyComparisonSection } from "@/pages/collection-summary/CollectionMonthlyComparisonSection";

type CollectionMonthlyComparisonPageProps = {
  role: string;
  staffNickname?: string | undefined;
};

function CollectionMonthlyComparisonPage({
  role,
  staffNickname = "",
}: CollectionMonthlyComparisonPageProps) {
  const canFilterByNickname = role === "admin" || role === "superuser";
  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [nicknameOptionsLoading, setNicknameOptionsLoading] = useState(canFilterByNickname);
  const [nicknameOptionsError, setNicknameOptionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canFilterByNickname) {
      setNicknameOptions([]);
      setNicknameOptionsError(null);
      setNicknameOptionsLoading(false);
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    setNicknameOptionsLoading(true);
    setNicknameOptionsError(null);

    void (async () => {
      try {
        const response = await getCollectionNicknames(undefined, {
          signal: controller.signal,
        });
        if (disposed) {
          return;
        }
        setNicknameOptions(Array.isArray(response?.nicknames) ? response.nicknames : []);
      } catch (error: unknown) {
        if (controller.signal.aborted || disposed) {
          return;
        }
        setNicknameOptions([]);
        setNicknameOptionsError(parseApiError(error));
      } finally {
        if (disposed) {
          return;
        }
        setNicknameOptionsLoading(false);
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [canFilterByNickname]);

  return (
    <OperationalSectionCard
      title="Monthly Collection Comparison"
      description="Compare one staff nickname across a bounded month range, review month-to-month changes, and spot collection movement quickly without mixing it into the broader summary workflow."
      contentClassName="space-y-5"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="rounded-2xl border border-border/60 bg-background/75 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">
                Focus on one nickname at a time
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Choose a visible nickname, set the month range, and review total collection,
                difference, percentage change, and the month-by-month bar chart in one place.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                  Up to 24 months
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                  Empty months stay visible as RM0
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                  Single-nickname analysis
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
              Choose a range
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with the recent six months or narrow the analysis to the exact reporting
              window you need.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Review the change
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Difference and percentage change are calculated deterministically between the
              first and last selected months.
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              Read the trend
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The chart keeps the monthly trend easy to scan while the detailed month cards stay
              available below it.
            </p>
          </div>
        </div>
      </div>

      {nicknameOptionsLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground"
        >
          Loading visible nickname options...
        </div>
      ) : null}

      {!nicknameOptionsLoading && nicknameOptionsError ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {nicknameOptionsError}
        </p>
      ) : null}

      {!canFilterByNickname || !nicknameOptionsLoading ? (
        <CollectionMonthlyComparisonSection
          canFilterByNickname={canFilterByNickname}
          currentNickname={staffNickname}
          nicknameOptions={nicknameOptions}
          showHeader={false}
          standalone
        />
      ) : null}
    </OperationalSectionCard>
  );
}

const MemoizedCollectionMonthlyComparisonPage = memo(CollectionMonthlyComparisonPage);
MemoizedCollectionMonthlyComparisonPage.displayName = "CollectionMonthlyComparisonPage";

export default MemoizedCollectionMonthlyComparisonPage;
