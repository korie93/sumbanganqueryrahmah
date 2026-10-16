import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void };

export function CollectionDailyDiscardChangesDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        const refresh = document.getElementById("collection-daily-refresh");
        const target = refresh instanceof HTMLButtonElement && !refresh.disabled
          ? refresh : document.querySelector<HTMLElement>("[data-collection-daily-calendar]");
        if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Buang perubahan kalendar yang belum disimpan?</AlertDialogTitle>
          <AlertDialogDescription>
            Refresh akan memuatkan semula status kalendar yang telah disimpan. Perubahan anda hanya dibuang selepas data berjaya dimuatkan. Rekod kutipan dan resit tidak dipadam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Kekalkan perubahan</AlertDialogCancel>
          <AlertDialogAction className="min-h-11" onClick={onConfirm}>Refresh dan buang perubahan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
