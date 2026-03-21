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
            <Label>Customer Name</Label>
            <Input
              value={editCustomerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>IC Number</Label>
            <Input
              value={editIcNumber}
              onChange={(event) => onIcNumberChange(event.target.value)}
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Customer Phone Number</Label>
            <Input
              value={editCustomerPhone}
              onChange={(event) => onCustomerPhoneChange(event.target.value)}
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input
              value={editAccountNumber}
              onChange={(event) => onAccountNumberChange(event.target.value)}
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
            <Input
              type="date"
              value={editPaymentDate}
              max={maxPaymentDate}
              onChange={(event) => onPaymentDateChange(event.target.value)}
              disabled={savingEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Amount (RM)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editAmount}
              onChange={(event) => onAmountChange(event.target.value)}
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
              inputRef={editReceiptInputRef}
              existingReceipts={editingRecord?.receipts || []}
              removedReceiptIds={editRemovedReceiptIds}
              disabled={savingEdit}
              onFileChange={onReceiptChange}
              onRemovePending={onRemovePendingReceipt}
              onClearPending={onClearPendingReceipts}
              onViewExisting={onViewExistingReceipt}
              onToggleRemoveExisting={onToggleRemoveExistingReceipt}
              uploadLabel="Add Receipt One by One"
              helperText="Receipt sedia ada kekal dipautkan sehingga anda pilih untuk membuangnya. Receipt baru akan ditambah pada rekod yang sama."
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
