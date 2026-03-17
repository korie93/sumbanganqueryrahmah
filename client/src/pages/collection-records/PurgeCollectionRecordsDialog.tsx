import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { formatAmountRM } from "@/pages/collection/utils";

export type PurgeCollectionRecordsDialogProps = {
  open: boolean;
  loading: boolean;
  purging: boolean;
  passwordInput: string;
  summary: {
    cutoffDate: string;
    eligibleRecords: number;
    totalAmount: number;
  } | null;
  onOpenChange: (open: boolean) => void;
  onPasswordInputChange: (value: string) => void;
  onConfirm: () => void;
};

export function PurgeCollectionRecordsDialog({
  open,
  loading,
  purging,
  passwordInput,
  summary,
  onOpenChange,
  onPasswordInputChange,
  onConfirm,
}: PurgeCollectionRecordsDialogProps) {
  const eligibleRecords = summary?.eligibleRecords ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Purge Rekod Collection Lama</AlertDialogTitle>
          <AlertDialogDescription>
            Rekod dengan tarikh bayaran sebelum {summary?.cutoffDate || "-"} akan dipadam secara kekal
            bersama lampiran receipt yang berkaitan. Tindakan ini hanya untuk superuser dan tidak boleh
            dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-border/60 bg-background/60 px-4 py-3 text-sm">
          <p>
            Eligible records: <span className="font-semibold">{loading ? "Checking..." : eligibleRecords}</span>
          </p>
          <p>
            Total amount:{" "}
            <span className="font-semibold">{formatAmountRM(summary?.totalAmount ?? 0)}</span>
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Sahkan dengan password login superuser</p>
          <Input
            type="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(event) => onPasswordInputChange(event.target.value)}
            placeholder="Masukkan password login superuser"
            disabled={loading || purging}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading || purging || eligibleRecords <= 0 || !passwordInput}
          >
            {purging ? "Purging..." : "Purge Sekarang"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
