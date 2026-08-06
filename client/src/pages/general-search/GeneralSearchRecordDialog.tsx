import { useMemo } from "react";
import { ContactRound, Database, ListTree, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mobileFullscreenDialogViewportClassName } from "@/components/ui/dialog-viewport";
import { useIsMobile } from "@/hooks/use-mobile";
import { GeneralSearchCollectionStatus } from "@/pages/general-search/GeneralSearchCollectionStatus";
import {
  GeneralSearchCollapsibleRecordSection,
  GeneralSearchRecordSection,
  GeneralSearchRecordSummary,
} from "@/pages/general-search/GeneralSearchRecordFields";
import { buildGeneralSearchRecordDialogView } from "@/pages/general-search/general-search-record-dialog-utils";
import type { SearchResultRow } from "@/pages/general-search/types";

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
  const dialogView = useMemo(
    () => (record ? buildGeneralSearchRecordDialogView(record, canSeeSourceFile) : null),
    [canSeeSourceFile, record],
  );
  const openAdditionalByDefault = dialogView
    ? dialogView.summaryFields.length === 0
      && dialogView.identityFields.length === 0
      && dialogView.contactFields.length === 0
      && dialogView.sourceFields.length === 0
    : false;

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? `${mobileFullscreenDialogViewportClassName} left-0 top-0 flex w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0`
            : "flex max-h-[88dvh] w-[min(94vw,960px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(94vw,960px)] sm:max-w-none sm:p-0"
        }
        data-testid="general-search-record-dialog"
      >
        <DialogHeader
          className={
            isMobile
              ? "border-b border-border/60 px-4 py-4 pr-11 text-left"
              : "border-b border-border/60 px-5 py-4 pr-12 text-left"
          }
        >
          <p className="text-2xs font-semibold uppercase tracking-label-md text-primary">
            Customer &amp; Account 360
          </p>
          <DialogTitle>Record Details</DialogTitle>
          <DialogDescription>
            Maklumat pelanggan, akaun, collection dan sumber bagi rekod terpilih.
          </DialogDescription>
        </DialogHeader>
        {record && dialogView ? (
          <div
            className={
              isMobile
                ? "min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4"
                : "min-h-0 flex-1 overflow-y-auto px-5 py-4"
            }
          >
            <div className="space-y-5">
              <GeneralSearchRecordSummary fields={dialogView.summaryFields} />

              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                <div className="order-2 min-w-0 space-y-5 lg:order-1">
                  <GeneralSearchRecordSection
                    fields={dialogView.identityFields}
                    icon={UserRound}
                    id="general-search-record-identity-heading"
                    title="Identiti & akaun"
                  />
                  <GeneralSearchRecordSection
                    fields={dialogView.contactFields}
                    icon={ContactRound}
                    id="general-search-record-contact-heading"
                    title="Hubungan & alamat"
                  />
                  <GeneralSearchRecordSection
                    fields={dialogView.sourceFields}
                    icon={Database}
                    id="general-search-record-source-heading"
                    title="Sumber data"
                  />
                </div>

                <aside
                  aria-labelledby="general-search-record-collection-heading"
                  className="order-1 min-w-0 self-start rounded-lg border border-border/60 bg-muted/20 p-4 lg:order-2"
                >
                  <h3
                    className="mb-3 text-xs font-semibold uppercase tracking-label-md text-muted-foreground"
                    id="general-search-record-collection-heading"
                  >
                    Status collection
                  </h3>
                  <GeneralSearchCollectionStatus
                    canSeeSourceFile={canSeeSourceFile}
                    className="min-w-0"
                    row={record}
                    showDetails
                  />
                </aside>
              </div>

              <GeneralSearchCollapsibleRecordSection
                defaultOpen={openAdditionalByDefault}
                fields={dialogView.additionalFields}
                icon={ListTree}
                id="general-search-record-additional-heading"
                title="Maklumat tambahan"
              />
              <GeneralSearchCollapsibleRecordSection
                fields={dialogView.emptyFields}
                icon={ListTree}
                id="general-search-record-empty-heading"
                title="Medan kosong"
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
