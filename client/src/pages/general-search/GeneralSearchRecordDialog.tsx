import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SearchResultRow } from "@/pages/general-search/types";
import {
  collectSearchHeaders,
  getCellDisplayText,
  getPriorityRank,
} from "@/pages/general-search/utils";

interface GeneralSearchRecordDialogProps {
  canSeeSourceFile: boolean;
  onOpenChange: (open: boolean) => void;
  record: SearchResultRow | null;
}

export function GeneralSearchRecordDialog({
  canSeeSourceFile,
  onOpenChange,
  record,
}: GeneralSearchRecordDialogProps) {
  const isMobile = useIsMobile();
  const orderedHeaders = useMemo(
    () => (record ? collectSearchHeaders([record], canSeeSourceFile) : []),
    [canSeeSourceFile, record],
  );

  const primarySummary = orderedHeaders
    .filter((header) => getPriorityRank(header) <= 2)
    .slice(0, 3)
    .map((header) => ({
      header,
      value: getCellDisplayText(record?.[header]),
    }))
    .filter((entry) => entry.value !== "-");

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
            : "w-[95vw] max-w-5xl max-h-[85vh] overflow-y-auto"
        }
      >
        <DialogHeader
          className={
            isMobile
              ? "border-b border-border/60 px-4 py-4 pr-11 text-left"
              : "pr-10 text-left"
          }
        >
          <DialogTitle>Record Details</DialogTitle>
          <DialogDescription>
            Review the selected search record without leaving the results page.
          </DialogDescription>
        </DialogHeader>
        {record ? (
          <div className={isMobile ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}>
            <div
              className={
                isMobile
                  ? "min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
                  : "space-y-4"
              }
            >
              {primarySummary.length > 0 ? (
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {primarySummary.map((entry) => (
                    <div
                      key={`summary-${entry.header}`}
                      className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {entry.header}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-foreground">
                        {entry.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {orderedHeaders.map((key) => {
                  const value = getCellDisplayText(record[key]);
                  const priorityRank = getPriorityRank(key);

                  return (
                    <div
                      key={key}
                      className={`rounded-xl border border-border/60 bg-muted/30 p-3 ${
                        priorityRank <= 1 ? "sm:col-span-2" : ""
                      }`}
                    >
                      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {key}
                      </div>
                      <div
                        className={`mt-1 break-words text-sm text-foreground ${
                          priorityRank <= 2 ? "font-semibold" : ""
                        }`}
                      >
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
