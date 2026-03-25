import { Badge } from "@/components/ui/badge";
import {
  getCollectionRollupFreshnessBadgeClass,
  type CollectionRollupFreshnessSnapshot,
} from "@/lib/collection-rollup-freshness";

type CollectionReportFreshnessBadgeProps = {
  freshness: CollectionRollupFreshnessSnapshot | null | undefined;
  className?: string;
};

export function CollectionReportFreshnessBadge({
  freshness,
  className = "",
}: CollectionReportFreshnessBadgeProps) {
  if (!freshness) {
    return null;
  }

  const label = freshness.status === "fresh"
    ? "Fresh"
    : freshness.status === "warming"
      ? "Updating"
      : "Stale";

  return (
    <Badge
      variant="outline"
      className={`${getCollectionRollupFreshnessBadgeClass(freshness.status)} ${className}`.trim()}
      title={freshness.message}
    >
      {label}
    </Badge>
  );
}
