import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollectionReceiptValidationBadge } from "@/pages/collection/CollectionReceiptValidationBadge";
import type { CollectionReceiptValidationPreview } from "@/pages/collection/receipt-validation";
type CollectionReceiptValidationCardProps = {
  validation: CollectionReceiptValidationPreview;
  canOverride: boolean;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  disabled?: boolean;
};

function resolveStatusTone(status: CollectionReceiptValidationPreview["status"]) {
  if (status === "matched") {
    return "text-foreground";
  }
  if (status === "needs_review" || status === "unverified") {
    return "text-amber-700";
  }
  return "text-destructive";
}

export function CollectionReceiptValidationCard({
  validation,
  canOverride,
  overrideReason,
  onOverrideReasonChange,
  disabled = false,
}: CollectionReceiptValidationCardProps) {
  const showOverrideField = validation.requiresOverride && canOverride;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Receipt Validation</p>
          <p className="text-xs text-muted-foreground">
            Bandingkan jumlah bayaran utama dengan jumlah semua resit yang aktif sebelum simpan.
          </p>
        </div>
        <CollectionReceiptValidationBadge
          status={validation.status}
          duplicateFlag={validation.duplicateWarningCount > 0}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
          <p className="text-sm font-semibold">{validation.totalPaidLabel}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Total</p>
          <p className="text-sm font-semibold">{validation.receiptTotalAmountLabel}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Difference</p>
          <p className="text-sm font-semibold">{validation.differenceAmountLabel}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Count</p>
          <p className="text-sm font-semibold">{validation.receiptCount}</p>
        </div>
      </div>

      <p className={`mt-3 text-sm ${resolveStatusTone(validation.status)}`}>
        {validation.message}
      </p>

      {validation.duplicateWarningCount > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Sistem mengesan {validation.duplicateWarningCount} resit yang mungkin pernah dimuat naik sebelum ini.
            Semak semula nombor rujukan dan fail yang dilampirkan sebelum meneruskan.
          </p>
        </div>
      ) : null}

      {showOverrideField ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor="collection-receipt-override-reason">Override Reason</Label>
          <Textarea
            id="collection-receipt-override-reason"
            value={overrideReason}
            onChange={(event) => onOverrideReasonChange(event.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Nyatakan sebab kenapa simpanan ini dibenarkan walaupun jumlah resit memerlukan override."
          />
          <p className="text-xs text-muted-foreground">
            Override hanya dibenarkan untuk admin atau superuser, dan sebab ini akan direkodkan dalam audit log.
          </p>
        </div>
      ) : null}
    </div>
  );
}
