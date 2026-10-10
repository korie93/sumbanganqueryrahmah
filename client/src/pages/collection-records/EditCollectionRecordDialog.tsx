import type { ChangeEvent, MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CollectionBatch,
  CollectionRecord,
  CollectionRecordReceipt,
  CollectionStaffNickname,
} from "@/lib/api";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import { getCollectionCardNumberLabel } from "@/pages/collection-records/utils";
import { CollectionManualSettlementPanel } from "./CollectionManualSettlementPanel";
import { CollectionRecordEditChangeSummary } from "./CollectionRecordEditChangeSummary";
import { CollectionRecordDiscardDialog } from "./CollectionRecordDiscardDialog";
import type { CollectionRecordEditChanges } from "./collection-record-edit-changes";

export interface EditCollectionRecordDialogProps {
  open: boolean;
  savingEdit: boolean;
  discardConfirmOpen: boolean;
  onDiscardConfirmOpenChange: (open: boolean) => void;
  onDiscardChanges: () => void;
  changeReview: CollectionRecordEditChanges;
  loadingNicknames: boolean;
  editingRecord: CollectionRecord | null;
  canManageManualSettlement: boolean;
  nicknameOptions: CollectionStaffNickname[];
  batchOptions: CollectionBatch[];
  editCustomerName: string;
  editIcNumber: string;
  editCustomerPhone: string;
  editAccountNumber: string;
  editBatch: CollectionBatch;
  editPaymentDate: string;
  maxPaymentDate: string;
  editAmount: string;
  editStaffNickname: string;
  editNewReceiptFiles: File[];
  editExistingReceiptDrafts: CollectionReceiptDraftInput[];
  editPendingReceiptDrafts: CollectionReceiptDraftInput[];
  editRemovedReceiptIds: string[];
  editReceiptInputRef: MutableRefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onCustomerNameChange: (value: string) => void;
  onIcNumberChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onBatchChange: (value: CollectionBatch) => void;
  onPaymentDateChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onStaffNicknameChange: (value: string) => void;
  onReceiptChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePendingReceipt: (index: number) => void;
  onClearPendingReceipts: () => void;
  onExistingReceiptDraftChange: (receiptId: string, patch: Partial<CollectionReceiptDraftInput>) => void;
  onPendingReceiptDraftChange: (index: number, patch: Partial<CollectionReceiptDraftInput>) => void;
  onToggleRemoveExistingReceipt: (receiptId: string) => void;
  onViewExistingReceipt: (receipt: CollectionRecordReceipt) => void;
  onSave: () => void;
  onManualSettlementChanged: (record: CollectionRecord) => void | Promise<void>;
}

export function EditCollectionRecordDialog({
  open,
  savingEdit,
  discardConfirmOpen,
  onDiscardConfirmOpenChange,
  onDiscardChanges,
  changeReview,
  loadingNicknames,
  editingRecord,
  canManageManualSettlement,
  nicknameOptions,
  batchOptions,
  editCustomerName,
  editIcNumber,
  editCustomerPhone,
  editAccountNumber,
  editBatch,
  editPaymentDate,
  maxPaymentDate,
  editAmount,
  editStaffNickname,
  editNewReceiptFiles,
  editExistingReceiptDrafts,
  editPendingReceiptDrafts,
  editRemovedReceiptIds,
  editReceiptInputRef,
  onOpenChange,
  onCloseAutoFocus,
  onCustomerNameChange,
  onIcNumberChange,
  onCustomerPhoneChange,
  onAccountNumberChange,
  onBatchChange,
  onPaymentDateChange,
  onAmountChange,
  onStaffNicknameChange,
  onReceiptChange,
  onRemovePendingReceipt,
  onClearPendingReceipts,
  onExistingReceiptDraftChange,
  onPendingReceiptDraftChange,
  onToggleRemoveExistingReceipt,
  onViewExistingReceipt,
  onSave,
  onManualSettlementChanged,
}: EditCollectionRecordDialogProps) {
  const dialogDescription =
    "Kemaskini maklumat collection, staff nickname, dan receipt yang dipautkan pada rekod ini.";
  const batchTriggerId = "edit-collection-batch";
  const paymentDateButtonId = "edit-collection-payment-date-button";
  const staffNicknameTriggerId = "edit-collection-staff-nickname";
  const saveDisabled = savingEdit || !changeReview.hasChanges;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:p-0"
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={(event) => {
          const pointer = event.detail.originalEvent;
          if (changeReview.hasChanges && !savingEdit && pointer.button === 0 && !pointer.ctrlKey) {
            // Opening the confirmation during pointerdown must not let the
            // original outside click move focus back out of the new dialog.
            pointer.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6 sm:pr-12">
          <DialogTitle>Edit Collection Record</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-collection-customer-name">Customer Name</Label>
            <Input
              id="edit-collection-customer-name"
              name="customerName"
              value={editCustomerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              autoComplete="name"
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-collection-ic-number">IC Number</Label>
            <Input
              id="edit-collection-ic-number"
              name="customerIcNumber"
              value={editIcNumber}
              onChange={(event) => onIcNumberChange(event.target.value)}
              autoComplete="off"
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-collection-customer-phone">Customer Phone Number</Label>
            <Input
              id="edit-collection-customer-phone"
              name="customerPhoneNumber"
              type="tel"
              value={editCustomerPhone}
              onChange={(event) => onCustomerPhoneChange(event.target.value)}
              autoComplete="tel"
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-collection-account-number">Account Number</Label>
            <Input
              id="edit-collection-account-number"
              name="accountNumber"
              value={editAccountNumber}
              onChange={(event) => onAccountNumberChange(event.target.value)}
              autoComplete="off"
              disabled={savingEdit}
            />
            {editingRecord?.cardNumber ? (
              <p className="text-xs text-muted-foreground">
                Matched Card: {getCollectionCardNumberLabel(editingRecord.cardNumber)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={batchTriggerId}>Batch</Label>
            <Select value={editBatch} onValueChange={(value) => onBatchChange(value as CollectionBatch)} disabled={savingEdit}>
              <SelectTrigger id={batchTriggerId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batchOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={paymentDateButtonId}>Payment Date</Label>
            <DatePickerField
              buttonId={paymentDateButtonId}
              value={editPaymentDate}
              onChange={onPaymentDateChange}
              disabled={savingEdit}
              placeholder="Select payment date..."
              ariaLabel="Payment Date"
              buttonTestId="edit-collection-payment-date"
              disabledDates={{ after: new Date(`${maxPaymentDate}T23:59:59`) }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-collection-amount">Amount (RM)</Label>
            <Input
              id="edit-collection-amount"
              name="collectionAmount"
              type="number"
              min="0"
              step="0.01"
              value={editAmount}
              onChange={(event) => onAmountChange(event.target.value)}
              autoComplete="off"
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={staffNicknameTriggerId}>Staff Nickname</Label>
            <Select
              value={editStaffNickname}
              onValueChange={onStaffNicknameChange}
              disabled={savingEdit || loadingNicknames}
            >
              <SelectTrigger id={staffNicknameTriggerId}>
                <SelectValue placeholder="Pilih staff nickname" />
              </SelectTrigger>
              <SelectContent>
                {nicknameOptions
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.nickname}>
                      {item.nickname}
                    </SelectItem>
                  ))}
                {editStaffNickname &&
                !nicknameOptions.some(
                  (item) => item.nickname === editStaffNickname && item.isActive,
                ) ? (
                  <SelectItem value={editStaffNickname}>
                    {editStaffNickname} (inactive)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium leading-none text-foreground">Receipt Upload</p>
            <CollectionReceiptPanel
              pendingFiles={editNewReceiptFiles}
              pendingReceiptDrafts={editPendingReceiptDrafts}
              inputRef={editReceiptInputRef}
              existingReceipts={editingRecord?.receipts || []}
              existingReceiptDrafts={editExistingReceiptDrafts}
              removedReceiptIds={editRemovedReceiptIds}
              disabled={savingEdit}
              onFileChange={onReceiptChange}
              onPendingDraftChange={onPendingReceiptDraftChange}
              onExistingDraftChange={onExistingReceiptDraftChange}
              onRemovePending={onRemovePendingReceipt}
              onClearPending={onClearPendingReceipts}
              onViewExisting={onViewExistingReceipt}
              onToggleRemoveExisting={onToggleRemoveExistingReceipt}
              uploadLabel="Add Receipt One by One"
              helperText="Receipt sedia ada kekal dipautkan sehingga anda tandakan buang. Receipt baru hanya akan disimpan selepas Save, dan status remove/replace dipaparkan di bawah."
            />
          </div>
          {editingRecord ? (
            <CollectionManualSettlementPanel
              record={editingRecord}
              canManage={canManageManualSettlement}
              disabled={savingEdit}
              onChanged={onManualSettlementChanged}
            />
          ) : null}
          <CollectionRecordEditChangeSummary changeReview={changeReview} />
        </div>
        <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t px-4 py-4 sm:gap-2 sm:space-x-0 sm:px-6">
          {savingEdit ? (
            <p
              id="edit-collection-save-disabled-reason"
              role="status"
              className="w-full text-xs leading-relaxed text-muted-foreground"
            >
              Changes are being saved. Please wait before saving again.
            </p>
          ) : !changeReview.hasChanges ? (
            <p
              id="edit-collection-save-disabled-reason"
              className="w-full text-xs leading-relaxed text-muted-foreground"
            >
              Tiada perubahan untuk disimpan.
            </p>
          ) : null}
          <Button
            className="min-h-11 flex-1 sm:flex-none"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={savingEdit}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 flex-1 sm:flex-none"
            onClick={onSave}
            disabled={saveDisabled}
            aria-describedby={saveDisabled ? "edit-collection-save-disabled-reason" : undefined}
          >
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <CollectionRecordDiscardDialog
        open={discardConfirmOpen}
        saving={savingEdit}
        onOpenChange={onDiscardConfirmOpenChange}
        onDiscard={onDiscardChanges}
      />
    </Dialog>
  );
}
