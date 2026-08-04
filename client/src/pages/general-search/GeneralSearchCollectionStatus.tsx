import { CheckCircle2, CircleHelp, CircleMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getGeneralSearchCollectionStatus,
} from "@/pages/general-search/collection-status";
import type { SearchResultRow } from "@/pages/general-search/types";

type GeneralSearchCollectionStatusProps = {
  canSeeSourceFile: boolean;
  className?: string | undefined;
  row: SearchResultRow;
  showDetails?: boolean | undefined;
};

export function GeneralSearchCollectionStatus({
  canSeeSourceFile,
  className,
  row,
  showDetails = false,
}: GeneralSearchCollectionStatusProps) {
  const status = getGeneralSearchCollectionStatus(row);

  if (status.state === "recorded") {
    const source = status.sourceImportName || status.sourceFilename;
    return (
      <div className={cn("min-w-[11rem] space-y-1", className)}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Collection direkodkan</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {status.recordCount} {status.recordCount === 1 ? "rekod" : "rekod berkaitan"}
          {status.latestPaymentDate ? ` - terkini ${status.latestPaymentDate}` : ""}
        </p>
        {showDetails && canSeeSourceFile && (source || status.latestStaffNickname) ? (
          <p className="break-words text-xs text-muted-foreground">
            {source ? `Source: ${source}` : "Source tidak direkodkan"}
            {status.latestStaffNickname ? ` - Nickname: ${status.latestStaffNickname}` : ""}
          </p>
        ) : null}
        {showDetails && status.matchBasis === "identifier_only" ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Rekod lama dipadankan melalui pengenal data; source asal tidak direkodkan.
          </p>
        ) : null}
      </div>
    );
  }

  if (status.state === "not_recorded") {
    return (
      <div className={cn("flex min-w-[11rem] items-center gap-2 text-sm text-muted-foreground", className)}>
        <CircleMinus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Tiada rekod collection</span>
      </div>
    );
  }

  return (
    <div className={cn("min-w-[11rem] space-y-1", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
        <CircleHelp className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Tidak dapat disahkan</span>
      </div>
      {showDetails ? (
        <p className="text-xs text-muted-foreground">
          Tiada kolum IC, telefon atau akaun yang dikenal pasti pada data ini.
        </p>
      ) : null}
    </div>
  );
}
