import { memo, useEffect, useState } from "react";
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
  const canFilterByNickname =
    role === "admin" || role === "manager" || role === "superuser";
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
    <section className="min-w-0 space-y-4" aria-label="Monthly Collection Comparison workspace">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Monthly Collection Comparison</h2>
        <p className="text-sm text-muted-foreground">Compare one staff nickname across the first and last months in your range.</p>
        <p className="text-xs text-muted-foreground">24 months max · Empty months stay visible</p>
      </header>

      {nicknameOptionsLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          Loading visible nickname options...
        </div>
      ) : null}

      {!nicknameOptionsLoading && nicknameOptionsError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
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
    </section>
  );
}

const MemoizedCollectionMonthlyComparisonPage = memo(CollectionMonthlyComparisonPage);
MemoizedCollectionMonthlyComparisonPage.displayName = "CollectionMonthlyComparisonPage";

export default MemoizedCollectionMonthlyComparisonPage;
