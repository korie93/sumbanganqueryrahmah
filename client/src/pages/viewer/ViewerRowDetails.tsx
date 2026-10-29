import { useMemo, useRef, type CSSProperties } from "react";
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
import { getViewerDetailHeaders, getViewerRowIdentity } from "@/pages/viewer/viewer-column-presentation";
import { ViewerDetailFields } from "@/pages/viewer/ViewerDetailFields";
import { useMobileViewportState } from "@/hooks/use-mobile-viewport-state";
import styles from "./ViewerRowDetails.module.css";

type DetailViewportStyle = CSSProperties & {
  "--viewer-detail-available-height": string;
  "--viewer-detail-center": string;
};

interface ViewerRowDetailsProps {
  row: DataRowWithId | null;
  headers: string[];
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** Read-only inspection of the authorized row already loaded in the Viewer. */
export function ViewerRowDetails({ row, headers, onOpenChange, onCloseAutoFocus }: ViewerRowDetailsProps) {
  const detailHeaders = useMemo(() => getViewerDetailHeaders(headers), [headers]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const identity = row ? getViewerRowIdentity(row, detailHeaders) : "Record details";
  const { viewportHeight, bottomInset } = useMobileViewportState({ trackAllWidths: true });
  const viewportStyle: DetailViewportStyle | undefined = viewportHeight > 0 && typeof window !== "undefined" ? {
    "--viewer-detail-available-height": `${viewportHeight}px`,
    "--viewer-detail-center": `${Math.max(0, window.innerHeight - bottomInset - viewportHeight) + viewportHeight / 2}px`,
  } : undefined;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className={`flex min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0 ${styles.dialog}`}
        style={viewportStyle} data-compact={viewportHeight > 0 && viewportHeight < 540 ? true : undefined}
        data-very-short={viewportHeight > 0 && viewportHeight <= 320 ? true : undefined}
        data-testid="viewer-record-details" onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          // Focus the record heading so opening details does not summon a mobile keyboard.
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}>
        <DialogHeader data-testid="viewer-record-details-header"
          className={`shrink-0 space-y-0 border-b border-border px-5 pr-12 text-left sm:px-6 ${styles.header}`}>
          <p className={`text-xs font-medium text-muted-foreground ${styles.context}`}>Record details · Row {row ? row.__rowId + 1 : ""}</p>
          <DialogTitle ref={titleRef} tabIndex={-1} title={identity}
            className={`break-words leading-6 [overflow-wrap:anywhere] ${styles.title}`}>
            {identity}
          </DialogTitle>
          <DialogDescription className={styles.description}>Read-only view of the fields loaded on this page.</DialogDescription>
        </DialogHeader>
        {row ? <ViewerDetailFields key={row.__rowId} row={row} headers={detailHeaders} /> : null}
        <DialogFooter data-testid="viewer-record-details-footer"
          className={`shrink-0 border-t border-border px-5 sm:px-6 ${styles.footer}`}>
          <DialogClose asChild><Button variant="outline" type="button">Close details</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
