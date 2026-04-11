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

export interface EditCollectionRecordDialogProps {
  open: boolean;
  savingEdit: boolean;
  loadingNicknames: boolean;
  editingRecord: CollectionRecord | null;
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
}

export function EditCollectionRecordDialog({
  open,
  savingEdit,
  loadingNicknames,
  editingRecord,
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
}: EditCollectionRecordDialogProps) {
  const dialogDescription =
    "Kemaskini maklumat collection, staff nickname, dan receipt yang dipautkan pada rekod ini.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit Collection Record</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
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
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={editBatch} onValueChange={(value) => onBatchChange(value as CollectionBatch)} disabled={savingEdit}>
              <SelectTrigger>
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
            <Label>Payment Date</Label>
            <DatePickerField
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
            <Label>Staff Nickname</Label>
            <Select
              value={editStaffNickname}
              onValueChange={onStaffNicknameChange}
              disabled={savingEdit || loadingNicknames}
            >
              <SelectTrigger>
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
            <Label>Receipt Upload</Label>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savingEdit}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
