import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CollectionReceiptValidationStatus } from "@/lib/api";
import { getCollectionReceiptValidationStatusLabel } from "@/pages/collection/collection-receipt-status";
import { cn } from "@/lib/utils";

type CollectionReceiptValidationBadgeProps = {
  status: CollectionReceiptValidationStatus;
  duplicateFlag?: boolean;
  className?: string;
};

function resolveStatusBadgeProps(status: CollectionReceiptValidationStatus) {
  if (status === "matched") {
    return {
      variant: "secondary" as const,
      className: "",
    };
  }

  if (status === "underpaid" || status === "overpaid") {
    return {
      variant: "destructive" as const,
      className: "",
    };
  }

  return {
    variant: "outline" as const,
    className: "border-amber-500/45 text-amber-800 dark:text-amber-200",
  };
}

export function CollectionReceiptValidationBadge({
  status,
  duplicateFlag = false,
  className,
}: CollectionReceiptValidationBadgeProps) {
  const badgeProps = resolveStatusBadgeProps(status);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge variant={badgeProps.variant} className={badgeProps.className}>
        {getCollectionReceiptValidationStatusLabel(status)}
      </Badge>
      {duplicateFlag ? (
        <Badge variant="outline" className="border-amber-500/45 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Duplicate Warning
        </Badge>
      ) : null}
    </div>
  );
}
