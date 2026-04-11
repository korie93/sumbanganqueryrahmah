import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { cn } from "@/lib/utils";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import { COLLECTION_BATCH_OPTIONS } from "./utils";
import { useSaveCollectionPageState } from "./useSaveCollectionPageState";
import type { CollectionBatch } from "@/lib/api";

type SaveCollectionPageProps = {
  staffNickname: string;
  onSaved?: () => void;
};

function SaveCollectionPage({ staffNickname, onSaved }: SaveCollectionPageProps) {
  const mutationFeedback = useMutationFeedback();
  const isMobile = useIsMobile();
  const keyboardOpen = useMobileKeyboardState();
  const state = useSaveCollectionPageState({
    staffNickname,
    onSaved,
    mutationFeedback,
  });

  usePageShortcuts([
    {
      key: "s",
      ctrlOrMeta: true,
      allowInEditable: true,
      enabled: !state.submitting,
      handler: () => {
        void state.handleSubmit();
      },
    },
  ]);

  const customerFields = (
    <>
      <div className="space-y-2">
        <Label>Customer Name</Label>
        <Input
          name="customerName"
          value={state.customerName}
          onChange={(e) => state.setCustomerName(e.target.value)}
          disabled={state.submitting}
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label>IC Number</Label>
        <Input
          name="customerIcNumber"
          value={state.icNumber}
          onChange={(e) => state.setIcNumber(e.target.value)}
          disabled={state.submitting}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label>Customer Phone Number</Label>
        <Input
          name="customerPhoneNumber"
          type="tel"
          value={state.customerPhone}
          onChange={(e) => state.setCustomerPhone(e.target.value)}
          disabled={state.submitting}
          placeholder="+60 12-345 6789"
          inputMode="tel"
          autoComplete="tel"
        />
      </div>
    </>
  );

  const paymentFields = (
    <>
      <div className="space-y-2">
        <Label>Account Number</Label>
        <Input
          name="accountNumber"
          value={state.accountNumber}
          onChange={(e) => state.setAccountNumber(e.target.value)}
          disabled={state.submitting}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="save-collection-batch">Batch</Label>
        <select
          id="save-collection-batch"
          name="collectionBatch"
          value={state.batch}
          onChange={(event) => state.setBatch(event.target.value as CollectionBatch)}
          disabled={state.submitting}
          aria-label="Batch"
          className={cn(
            "w-full border border-input bg-background px-3 text-sm",
            isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md",
          )}
        >
          {COLLECTION_BATCH_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Payment Date</Label>
        <DatePickerField
          value={state.paymentDate}
          onChange={state.setPaymentDate}
          disabled={state.submitting}
          placeholder="Select payment date..."
          ariaLabel="Payment Date"
          buttonTestId="save-collection-payment-date"
          disabledDates={{ after: new Date(`${state.maxPaymentDate}T23:59:59`) }}
        />
        {state.isPaymentDateInFuture ? (
          <p className="text-xs text-destructive">Payment Date cannot be in the future.</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Amount (RM)</Label>
        <Input
          name="collectionAmount"
          type="number"
          min="0"
          step="0.01"
          value={state.amount}
          onChange={(e) => state.setAmount(e.target.value)}
          disabled={state.submitting}
          inputMode="decimal"
        />
      </div>
    </>
  );

  const receiptPanel = (
    <CollectionReceiptPanel
      pendingFiles={state.receiptFiles}
      pendingReceiptDrafts={state.receiptDrafts}
      inputRef={state.fileInputRef}
      disabled={state.submitting}
      onFileChange={state.handleReceiptChange}
      onPendingDraftChange={state.handlePendingDraftChange}
      onRemovePending={state.handleRemoveReceipt}
      onClearPending={state.handleClearPendingReceipts}
      uploadLabel="Upload Receipt One by One"
      helperText="Tambah satu receipt pada satu masa. Status Existing, Pending Upload, dan perubahan simpan/buang akan ditunjukkan di bawah sebelum anda klik Save Collection."
    />
  );

  return (
    <Card className={cn("border-border/60 bg-background/70", isMobile ? "overflow-hidden" : "")}>
      <CardHeader className={cn("space-y-3", isMobile ? "relative pb-4" : "")}>
        {isMobile ? (
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
        ) : null}
        <div className="relative space-y-2">
          {isMobile ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Collection
            </p>
          ) : null}
          <CardTitle className="text-xl">Simpan Collection Individual</CardTitle>
          {isMobile ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Save one collection record at a time with a cleaner mobile flow for customer details, payment
              info, and receipt upload.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Draft auto-saves in this browser session.</span>
          <span>
            Use <span className="font-medium text-foreground">Ctrl/Cmd+S</span> to save quickly.
          </span>
        </div>
        {state.draftRestoreNotice ? (
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Draft restored.</span>
            {state.restoreNoticeLabel ? ` Last saved ${state.restoreNoticeLabel}.` : null}
            {state.draftRestoreNotice.hadPendingReceipts
              ? " Pending receipt files need to be uploaded again before saving."
              : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isMobile ? (
          <div className="space-y-4">
            <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Customer Details</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Start with the payer identity so the record stays easy to verify later.
                </p>
              </div>
              <div className="grid gap-4">{customerFields}</div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Payment Details</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Capture the account, batch, payment date, and amount before attaching receipts.
                </p>
              </div>
              <div className="grid gap-4">{paymentFields}</div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Receipt Upload</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Add receipts one by one, review pending uploads, then save when everything looks right.
                </p>
              </div>
              {receiptPanel}
            </section>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {customerFields}
            {paymentFields}
            <div className="space-y-2 md:col-span-3">
              <Label>Receipt Upload</Label>
              {receiptPanel}
            </div>
          </div>
        )}

        <div
          className={cn(
            "-mx-6 flex flex-col gap-2 border-t border-border/60 bg-background/95 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:shadow-none sm:backdrop-blur-0",
            keyboardOpen ? "static" : "sticky bottom-0 z-[var(--z-sticky-content)]",
          )}
          data-floating-ai-avoid="true"
        >
          <Button
            type="button"
            variant="outline"
            onClick={state.clearForm}
            disabled={state.submitting}
            className="w-full sm:w-auto"
          >
            Reset Form
          </Button>
          <Button type="button" onClick={state.handleSubmit} disabled={state.submitting} className="w-full sm:w-auto">
            {state.submitting ? "Saving..." : "Save Collection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(SaveCollectionPage);
