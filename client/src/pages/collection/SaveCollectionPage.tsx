import { memo, type ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createCollectionRecord, type CollectionBatch } from "@/lib/api";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import {
  COLLECTION_BATCH_OPTIONS,
  getTodayIsoDate,
  isFutureDate,
  isValidCustomerPhone,
  isPositiveAmount,
  isValidDate,
  emitCollectionDataChanged,
  parseApiError,
  toReceiptPayload,
  validateReceiptFile,
} from "./utils";

type SaveCollectionPageProps = {
  staffNickname: string;
  onSaved?: () => void;
};

function SaveCollectionPage({ staffNickname, onSaved }: SaveCollectionPageProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitInFlightRef = useRef(false);

  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  const clearForm = () => {
    setCustomerName("");
    setIcNumber("");
    setCustomerPhone("");
    setAccountNumber("");
    setBatch("P10");
    setPaymentDate("");
    setAmount("");
    setReceiptFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) {
      return;
    }

    const error = validateReceiptFile(file);
    if (error) {
      toast({
        title: "Validation Error",
        description: error,
        variant: "destructive",
      });
      return;
    }

    setReceiptFiles((previous) => [...previous, file]);
  };

  const handleRemoveReceipt = (index: number) => {
    setReceiptFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleClearPendingReceipts = () => {
    setReceiptFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validateForm = (): string | null => {
    if (!staffNickname || staffNickname.trim().length < 2) return "Staff nickname is required.";
    if (!customerName.trim()) return "Customer Name is required.";
    if (!icNumber.trim()) return "IC Number is required.";
    if (!isValidCustomerPhone(customerPhone)) return "Customer Phone Number is invalid. Use 8-20 chars with digits/space/dash/plus.";
    if (!accountNumber.trim()) return "Account Number is required.";
    if (!COLLECTION_BATCH_OPTIONS.includes(batch)) return "Batch is not valid.";
    if (!isValidDate(paymentDate)) return "Payment Date is invalid.";
    if (isFutureDate(paymentDate)) return "Payment Date cannot be in the future.";
    if (!isPositiveAmount(amount)) return "Amount must be greater than 0.";
    return null;
  };

  const handleSubmit = async () => {
    if (submitting || submitInFlightRef.current) return;

    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const receipts =
        receiptFiles.length > 0
          ? await Promise.all(receiptFiles.map((file) => toReceiptPayload(file)))
          : [];

      await createCollectionRecord({
        customerName: customerName.trim(),
        icNumber: icNumber.trim(),
        customerPhone: customerPhone.trim(),
        accountNumber: accountNumber.trim(),
        batch,
        paymentDate,
        amount: Number(amount),
        collectionStaffNickname: staffNickname.trim(),
        receipts,
      });

      toast({
        title: "Collection Saved",
        description: "Rekod collection berjaya disimpan.",
      });
      emitCollectionDataChanged();
      clearForm();
      onSaved?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Collection",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader>
        <CardTitle className="text-xl">Simpan Collection Individual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Customer Name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label>IC Number</Label>
            <Input value={icNumber} onChange={(e) => setIcNumber(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label>Customer Phone Number</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              disabled={submitting}
              placeholder="+60 12-345 6789"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Number</Label>
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={batch} onValueChange={(value) => setBatch(value as CollectionBatch)} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select batch" />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_BATCH_OPTIONS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              max={maxPaymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              disabled={submitting}
            />
            {isPaymentDateInFuture ? (
              <p className="text-xs text-destructive">Payment Date cannot be in the future.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Amount (RM)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Receipt Upload</Label>
            <CollectionReceiptPanel
              pendingFiles={receiptFiles}
              inputRef={fileInputRef}
              disabled={submitting}
              onFileChange={handleReceiptChange}
              onRemovePending={handleRemoveReceipt}
              onClearPending={handleClearPendingReceipts}
              uploadLabel="Upload Receipt One by One"
              helperText="Tambah satu receipt pada satu masa. Semua receipt ini akan disimpan di bawah customer collection yang sama."
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={clearForm}
            disabled={submitting}
          >
            Reset Form
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save Collection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default memo(SaveCollectionPage);
