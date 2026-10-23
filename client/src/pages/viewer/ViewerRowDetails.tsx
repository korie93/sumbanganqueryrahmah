import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DataRowWithId } from "@/pages/viewer/types";
import { getViewerDetailFields, getViewerDetailHeaders, getViewerRowIdentity } from "@/pages/viewer/viewer-column-presentation";

interface ViewerRowDetailsProps {
  row: DataRowWithId | null;
  headers: string[];
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** Read-only inspection of the authorized row already loaded in the Viewer. */
export function ViewerRowDetails({ row, headers, onOpenChange, onCloseAutoFocus }: ViewerRowDetailsProps) {
  const detailHeaders = useMemo(() => getViewerDetailHeaders(headers), [headers]);

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:p-0" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader className="border-b border-border px-5 py-5 pr-12 text-left sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">Record details · Row {row ? row.__rowId + 1 : ""}</p>
          <DialogTitle className="break-words leading-6 [overflow-wrap:anywhere]">
            {row ? getViewerRowIdentity(row, detailHeaders) : "Record details"}
          </DialogTitle>
          <DialogDescription>Read-only view of the fields loaded on this page.</DialogDescription>
        </DialogHeader>
        <dl className="min-w-0 divide-y divide-border px-5 sm:px-6">
          {row ? getViewerDetailFields(row, detailHeaders).map(({ header, value }) => (
              <div key={header} className="grid min-w-0 gap-1.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
                <dt className="break-words text-xs font-medium leading-5 text-muted-foreground [overflow-wrap:anywhere]">{header}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{value}</dd>
              </div>
          )) : null}
        </dl>
        <DialogFooter className="border-t border-border px-5 py-4 sm:px-6">
          <DialogClose asChild><Button variant="outline" type="button">Close details</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
