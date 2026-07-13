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
import { getAriaInvalidProps, getAriaRequiredProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import { SaveCollectionFormSection } from "@/pages/collection/SaveCollectionFormSection";
import { SaveCollectionPostSaveActions } from "@/pages/collection/SaveCollectionPostSaveActions";
import { SaveCollectionProgress } from "@/pages/collection/SaveCollectionProgress";
import { SaveCollectionReadySummary } from "@/pages/collection/SaveCollectionReadySummary";
import { SaveCollectionSubmitAlert } from "@/pages/collection/SaveCollectionSubmitAlert";
import { COLLECTION_BATCH_OPTIONS } from "./utils";
import { useSaveCollectionPageState } from "./useSaveCollectionPageState";
import type { CollectionBatch } from "@/lib/api";

type SaveCollectionPageProps = {
  staffNickname: string;
  onSaved?: () => void;
};

function getInvalidFieldProps(errorMessage: string | undefined, errorId: string) {
  const invalidProps = getAriaInvalidProps(Boolean(errorMessage));

  return errorMessage
    ? {
      "aria-describedby": errorId,
      ...invalidProps,
    }
    : {};
}

function SaveCollectionPage({ staffNickname, onSaved }: SaveCollectionPageProps) {
  const mutationFeedback = useMutationFeedback();
  const isMobile = useIsMobile();
  const keyboardOpen = useMobileKeyboardState();
  const customerNameInputId = "save-collection-customer-name";
  const customerIcNumberInputId = "save-collection-customer-ic-number";
  const customerPhoneInputId = "save-collection-customer-phone";
  const accountNumberInputId = "save-collection-account-number";
  const batchInputId = "save-collection-batch";
  const paymentDateButtonId = "save-collection-payment-date-button";
  const amountInputId = "save-collection-amount";
  const state = useSaveCollectionPageState({
    staffNickname,
    onSaved,
    mutationFeedback,
  });
  const customerNameErrorId = `${customerNameInputId}-error`;
  const icNumberErrorId = `${customerIcNumberInputId}-error`;
  const customerPhoneErrorId = `${customerPhoneInputId}-error`;
  const accountNumberErrorId = `${accountNumberInputId}-error`;
  const batchErrorId = `${batchInputId}-error`;
  const paymentDateErrorId = `${paymentDateButtonId}-error`;
  const amountErrorId = `${amountInputId}-error`;
  const paymentDateError = state.fieldErrors.paymentDate
    || (state.isPaymentDateInFuture ? "Payment Date cannot be in the future." : "");
  const customerNameValidationProps = getInvalidFieldProps(
    state.fieldErrors.customerName,
    customerNameErrorId,
  );
  const icNumberValidationProps = getInvalidFieldProps(
    state.fieldErrors.icNumber,
    icNumberErrorId,
  );
  const customerPhoneValidationProps = getInvalidFieldProps(
    state.fieldErrors.customerPhone,
    customerPhoneErrorId,
  );
  const accountNumberValidationProps = getInvalidFieldProps(
    state.fieldErrors.accountNumber,
    accountNumberErrorId,
  );
  const batchValidationProps = getInvalidFieldProps(state.fieldErrors.batch, batchErrorId);
  const paymentDateValidationProps = getInvalidFieldProps(
    paymentDateError,
    paymentDateErrorId,
  );
  const amountValidationProps = getInvalidFieldProps(state.fieldErrors.amount, amountErrorId);
  const requiredFieldProps = getAriaRequiredProps(true);

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
        <Label htmlFor={customerNameInputId}>Customer Name</Label>
        <Input
          id={customerNameInputId}
          name="customerName"
          value={state.customerName}
          onChange={(e) => state.setCustomerName(e.target.value)}
          onBlur={() => state.validateField("customerName")}
          disabled={state.submitting}
          autoComplete="name"
          {...requiredFieldProps}
          {...customerNameValidationProps}
        />
        {state.fieldErrors.customerName ? (
          <p id={customerNameErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.customerName}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={customerIcNumberInputId}>IC Number</Label>
        <Input
          id={customerIcNumberInputId}
          name="customerIcNumber"
          value={state.icNumber}
          onChange={(e) => state.setIcNumber(e.target.value)}
          onBlur={() => state.validateField("icNumber")}
          disabled={state.submitting}
          inputMode="numeric"
          autoComplete="off"
          {...requiredFieldProps}
          {...icNumberValidationProps}
        />
        {state.fieldErrors.icNumber ? (
          <p id={icNumberErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.icNumber}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={customerPhoneInputId}>Customer Phone Number</Label>
        <Input
          id={customerPhoneInputId}
          name="customerPhoneNumber"
          type="tel"
          value={state.customerPhone}
          onChange={(e) => state.setCustomerPhone(e.target.value)}
          onBlur={() => state.validateField("customerPhone")}
          disabled={state.submitting}
          placeholder="+60 12-345 6789"
          inputMode="tel"
          autoComplete="tel"
          {...customerPhoneValidationProps}
        />
        {state.fieldErrors.customerPhone ? (
          <p id={customerPhoneErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.customerPhone}
          </p>
        ) : null}
      </div>
    </>
  );

  const paymentFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor={accountNumberInputId}>Account Number</Label>
        <Input
          id={accountNumberInputId}
          name="accountNumber"
          value={state.accountNumber}
          onChange={(e) => state.setAccountNumber(e.target.value)}
          onBlur={() => state.validateField("accountNumber")}
          disabled={state.submitting}
          autoComplete="off"
          {...requiredFieldProps}
          {...accountNumberValidationProps}
        />
        {state.fieldErrors.accountNumber ? (
          <p id={accountNumberErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.accountNumber}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={batchInputId}>Batch</Label>
        <select
          id={batchInputId}
          name="collectionBatch"
          value={state.batch}
          onChange={(event) => state.setBatch(event.target.value as CollectionBatch)}
          onBlur={() => state.validateField("batch")}
          disabled={state.submitting}
          aria-label="Batch"
          {...requiredFieldProps}
          {...batchValidationProps}
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
        {state.fieldErrors.batch ? (
          <p id={batchErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.batch}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={paymentDateButtonId}>Payment Date</Label>
        <DatePickerField
          buttonId={paymentDateButtonId}
          value={state.paymentDate}
          onChange={state.setPaymentDate}
          onBlur={() => state.validateField("paymentDate")}
          disabled={state.submitting}
          placeholder="Select payment date..."
          ariaLabel="Payment Date"
          required
          {...paymentDateValidationProps}
          buttonTestId="save-collection-payment-date"
          disabledDates={{ after: new Date(`${state.maxPaymentDate}T23:59:59`) }}
        />
        {paymentDateError ? (
          <p id={paymentDateErrorId} className="text-xs text-destructive" role="alert">
            {paymentDateError}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={amountInputId}>Amount (RM)</Label>
        <Input
          id={amountInputId}
          name="collectionAmount"
          type="number"
          min="0"
          step="0.01"
          value={state.amount}
          onChange={(e) => state.setAmount(e.target.value)}
          onBlur={() => state.validateField("amount")}
          disabled={state.submitting}
          inputMode="decimal"
          {...requiredFieldProps}
          {...amountValidationProps}
        />
        {state.fieldErrors.amount ? (
          <p id={amountErrorId} className="text-xs text-destructive" role="alert">
            {state.fieldErrors.amount}
          </p>
        ) : null}
      </div>
    </>
  );

  const receiptPanel = (
    <CollectionReceiptPanel
      pendingFiles={state.receiptFiles}
      pendingReceiptDrafts={state.receiptDrafts}
      inputRef={state.fileInputRef}
      disabled={state.submitting}
      pendingStatus={state.receiptPendingStatus}
      onFileChange={state.handleReceiptChange}
      onPendingDraftChange={state.handlePendingDraftChange}
      onRemovePending={state.handleRemoveReceipt}
      onClearPending={state.handleClearPendingReceipts}
      uploadLabel="Upload Receipt One by One"
      helperText="Tambah satu receipt pada satu masa. Status Existing, Pending Upload, dan perubahan simpan/buang akan ditunjukkan di bawah sebelum anda klik Save Collection."
    />
  );
  const customerSection = (
    <SaveCollectionFormSection
      title="Customer Details"
      description="Isi maklumat customer dahulu supaya rekod mudah disemak semula."
    >
      {customerFields}
    </SaveCollectionFormSection>
  );
  const paymentSection = (
    <SaveCollectionFormSection
      title="Payment Details"
      description="Semak account, batch, payment date, dan amount sebelum upload receipt."
    >
      {paymentFields}
    </SaveCollectionFormSection>
  );
  const receiptSection = (
    <SaveCollectionFormSection
      title="Receipt Upload"
      description="Tambah receipt satu demi satu. Preview resit, jumlah, tarikh dan reference dipaparkan dengan lebih jelas sebelum save."
      className="col-span-full"
    >
      {receiptPanel}
    </SaveCollectionFormSection>
  );
  const readySummaryValues = {
    staffNickname,
    customerName: state.customerName,
    icNumber: state.icNumber,
    customerPhone: state.customerPhone,
    accountNumber: state.accountNumber,
    batch: state.batch,
    paymentDate: state.paymentDate,
    amount: state.amount,
  };

  return (
    <Card className={cn("border-border/60 bg-background/70", isMobile ? "overflow-hidden" : "")}>
      <CardHeader className={cn("space-y-3", isMobile ? "relative pb-4" : "")}>
        {isMobile ? (
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
        ) : null}
        <div className="relative space-y-2">
          {isMobile ? (
            <p className="text-xs font-semibold uppercase tracking-label-lg text-muted-foreground">
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
        <SaveCollectionPostSaveActions
          summary={state.lastSavedSummary}
          onDismiss={state.clearLastSavedSummary}
        />
        <SaveCollectionSubmitAlert
          failure={state.submitFailure}
          disabled={state.submitting}
          onDismiss={state.clearSubmitFailure}
          onRetry={() => {
            void state.handleSubmit();
          }}
        />
        <SaveCollectionProgress
          phase={state.submitPhase}
          receiptCount={state.receiptFiles.length}
          failure={state.submitFailure}
          visible={state.submitting || Boolean(state.submitFailure) || state.receiptFiles.length > 0}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
          {customerSection}
          {paymentSection}
          {receiptSection}
        </div>

        <SaveCollectionReadySummary
          values={readySummaryValues}
          receiptCount={state.receiptFiles.length}
          receiptDrafts={state.receiptDrafts}
        />

        <div
          className={cn(
            "-mx-6 flex flex-col gap-2 border-t border-border/60 bg-background/95 px-6 pt-3 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)] shadow-lg sqr-backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:shadow-none sqr-sm-backdrop-blur-none",
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
