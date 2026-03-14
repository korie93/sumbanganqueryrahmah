import type { ChangeEvent, MutableRefObject } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CollectionBatch, CollectionRecord, CollectionStaffNickname } from "@/lib/api";

interface EditCollectionRecordDialogProps {
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
  editAmount: string;
  editStaffNickname: string;
  editReceiptFile: File | null;
  editRemoveReceipt: boolean;
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
  onClearReceipt: () => void;
  onToggleRemoveReceipt: () => void;
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
  editAmount,
  editStaffNickname,
  editReceiptFile,
  editRemoveReceipt,
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
  onClearReceipt,
  onToggleRemoveReceipt,
  onSave,
}: EditCollectionRecordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Collection Record</DialogTitle>
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
            <input
              ref={editReceiptInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
              onChange={onReceiptChange}
              disabled={savingEdit || editRemoveReceipt}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => editReceiptInputRef.current?.click()}
                disabled={savingEdit || editRemoveReceipt}
              >
                Upload Resit Bayaran
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClearReceipt}
                disabled={savingEdit || !editReceiptFile}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear
              </Button>
              {editingRecord?.receiptFile ? (
                <Button
                  type="button"
                  size="sm"
                  variant={editRemoveReceipt ? "secondary" : "outline"}
                  onClick={onToggleRemoveReceipt}
                  disabled={savingEdit}
                >
                  {editRemoveReceipt ? "Receipt will be removed" : "Remove existing receipt"}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Sila upload resit bayaran daripada customer (optional). Format: JPG, PNG, PDF
            </p>
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
