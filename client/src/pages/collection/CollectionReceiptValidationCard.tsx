import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionReceiptValidationPreview } from "@/pages/collection/receipt-validation";

type CollectionReceiptValidationCardProps = {
  validation: CollectionReceiptValidationPreview;
  canOverride: boolean;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  disabled?: boolean;
};

function resolveBadgeVariant(status: CollectionReceiptValidationPreview["status"]) {
  if (status === "matched") {
    return "secondary" as const;
  }
  if (status === "mismatch") {
    return "destructive" as const;
  }
  return "outline" as const;
}

function resolveStatusLabel(status: CollectionReceiptValidationPreview["status"]) {
  if (status === "matched") {
    return "Matched";
  }
  if (status === "mismatch") {
    return "Mismatch";
  }
  return "Needs Review";
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
        <Badge variant={resolveBadgeVariant(validation.status)}>
          {resolveStatusLabel(validation.status)}
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
          <p className="text-sm font-semibold">{validation.totalPaidLabel}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Total</p>
          <p className="text-sm font-semibold">{validation.receiptTotalAmountLabel}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Receipt Count</p>
          <p className="text-sm font-semibold">{validation.receiptCount}</p>
        </div>
      </div>

      <p
        className={`mt-3 text-sm ${
          validation.status === "matched" ? "text-foreground" : "text-destructive"
        }`}
      >
        {validation.message}
      </p>

      {showOverrideField ? (
        <div className="mt-3 space-y-2">
          <Label htmlFor="collection-receipt-override-reason">Override Reason</Label>
          <Textarea
            id="collection-receipt-override-reason"
            value={overrideReason}
            onChange={(event) => onOverrideReasonChange(event.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="Nyatakan sebab kenapa simpanan mismatch ini dibenarkan."
          />
          <p className="text-xs text-muted-foreground">
            Override hanya dibenarkan untuk admin atau superuser, dan sebab ini akan direkodkan dalam audit log.
          </p>
        </div>
      ) : null}
    </div>
  );
}
