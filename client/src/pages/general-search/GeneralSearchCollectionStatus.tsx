import { CheckCircle2, CircleHelp, CircleMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatGeneralSearchCollectionPaymentDate,
  formatGeneralSearchCollectionRecordedAt,
  getGeneralSearchCollectionStatus,
} from "@/pages/general-search/collection-status";
import type { SearchResultRow } from "@/pages/general-search/types";
import { formatAmountRM } from "@/pages/collection/utils";

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
    const savedBy = status.latestStaffNickname || status.latestCreatedByLogin || "Tidak dinyatakan";
    const accountNumber = status.latestAccountNumber || "Tidak dinyatakan";
    const paymentDate = formatGeneralSearchCollectionPaymentDate(status.latestPaymentDate);
    const recordedAt = formatGeneralSearchCollectionRecordedAt(status.latestCreatedAt);
    const amount = status.latestAmount ? formatAmountRM(status.latestAmount) : "Tidak dinyatakan";
    return (
      <div className={cn("min-w-[13rem] space-y-1.5", className)}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Collection direkodkan</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {status.recordCount} {status.recordCount === 1 ? "rekod" : "rekod berkaitan"}
          {` - ${amount} - ${paymentDate}`}
        </p>
        <p className="break-words text-xs text-muted-foreground">Disimpan oleh: {savedBy}</p>
        {!showDetails ? (
          <p className="min-w-0 text-xs text-muted-foreground">
            Akaun Collection:{" "}
            <span className="break-all font-medium text-foreground">{accountNumber}</span>
          </p>
        ) : null}
        {showDetails ? (
          <dl className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 pt-1 text-xs">
            <dt className="text-muted-foreground">Akaun Collection</dt>
            <dd className="min-w-0 break-all font-medium text-foreground">{accountNumber}</dd>
            <dt className="text-muted-foreground">Jumlah terkini</dt>
            <dd className="min-w-0 font-medium text-foreground">{amount}</dd>
            <dt className="text-muted-foreground">Tarikh bayaran</dt>
            <dd className="min-w-0 font-medium text-foreground">{paymentDate}</dd>
            <dt className="text-muted-foreground">Direkod pada</dt>
            <dd className="min-w-0 font-medium text-foreground">{recordedAt}</dd>
            <dt className="text-muted-foreground">Nickname</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">
              {status.latestStaffNickname || "Tidak dinyatakan"}
            </dd>
            <dt className="text-muted-foreground">Login penyimpan</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">
              {status.latestCreatedByLogin || "Tidak dinyatakan"}
            </dd>
            {canSeeSourceFile ? (
              <>
                <dt className="text-muted-foreground">Fail Saved</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">
                  {source || "Tidak direkodkan"}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {showDetails && status.matchBasis === "identifier_only" ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Rekod dipadankan melalui IC atau gabungan telefon dan akaun kerana pautan baris Saved belum tersedia.
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
