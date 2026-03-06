import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Paperclip, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createCollectionRecord, type CollectionBatch } from "@/lib/api";
import {
  COLLECTION_BATCH_OPTIONS,
  isValidCustomerPhone,
  isPositiveAmount,
  isValidDate,
  parseApiError,
  toReceiptPayload,
  validateReceiptFile,
} from "./utils";

type SaveCollectionPageProps = {
  staffNickname: string;
  onSaved?: () => void;
};

export default function SaveCollectionPage({ staffNickname, onSaved }: SaveCollectionPageProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedReceiptName = useMemo(() => receiptFile?.name || "", [receiptFile]);

  const clearForm = () => {
    setCustomerName("");
    setIcNumber("");
    setCustomerPhone("");
    setAccountNumber("");
    setBatch("P10");
    setPaymentDate("");
    setAmount("");
    setReceiptFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSelectReceipt = () => {
    fileInputRef.current?.click();
  };

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setReceiptFile(null);
      return;
    }
    const error = validateReceiptFile(file);
    if (error) {
      toast({
        title: "Validation Error",
        description: error,
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    setReceiptFile(file);
  };

  const handleClearReceipt = () => {
    setReceiptFile(null);
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
    if (!isPositiveAmount(amount)) return "Amount must be greater than 0.";
    return null;
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        customerName: customerName.trim(),
        icNumber: icNumber.trim(),
        customerPhone: customerPhone.trim(),
        accountNumber: accountNumber.trim(),
        batch,
        paymentDate,
        amount: Number(amount),
        collectionStaffNickname: staffNickname.trim(),
      };

      if (receiptFile) {
        payload.receipt = await toReceiptPayload(receiptFile);
      }

      await createCollectionRecord(payload);
      toast({
        title: "Collection Saved",
        description: "Rekod collection berjaya disimpan.",
      });
      clearForm();
      onSaved?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Collection",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
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
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label>Amount (RM)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={submitting} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Receipt Upload</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
              onChange={handleReceiptChange}
              disabled={submitting}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleSelectReceipt} disabled={submitting}>
                <Paperclip className="w-4 h-4 mr-2" />
                Upload Resit Bayaran
              </Button>
              <Button type="button" variant="ghost" onClick={handleClearReceipt} disabled={submitting || !receiptFile}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear
              </Button>
              {selectedReceiptName && (
                <span className="text-sm text-muted-foreground">{selectedReceiptName}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Sila upload resit bayaran daripada customer (optional). Format: JPG, PNG, PDF
            </p>
          </div>
          <div className="space-y-2">
            <Label>Staff Nickname</Label>
            <Input value={staffNickname} disabled />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Simpan Collection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
