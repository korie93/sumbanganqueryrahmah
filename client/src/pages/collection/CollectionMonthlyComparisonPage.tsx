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
        if (!disposed) {
          setNicknameOptionsLoading(false);
        }
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
      description="Compare one staff nickname across a bounded month range without crowding the broader collection workspace."
      contentClassName="space-y-4"
    >
      <div className="rounded-2xl border border-border/60 bg-background p-3.5 shadow-sm">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                One nickname, one compact monthly view
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Pick a visible nickname, compare the first and last months in your range, and keep the monthly chart close to the totals.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-2xs">
              <CalendarRange className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              24 months max
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-2xs">
              <TrendingUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              First vs last
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-2xs">
              Empty months stay visible
            </Badge>
          </div>
        </div>
      </div>

      {nicknameOptionsLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm"
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
