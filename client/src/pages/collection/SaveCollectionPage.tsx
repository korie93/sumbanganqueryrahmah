import { memo, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageShortcuts } from "@/hooks/usePageShortcuts";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import { type CollectionBatch, type CollectionReceiptMetadata } from "@/lib/api";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionMutationIdempotencyKey,
  createCollectionRecord,
} from "@/lib/api/collection-records";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import {
  buildCollectionReceiptMetadataPayload,
  createEmptyCollectionReceiptDraft,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import {
  clearSaveCollectionDraft,
  persistSaveCollectionDraft,
  readSaveCollectionDraft,
} from "@/pages/collection/save-collection-draft";
import {
  COLLECTION_BATCH_OPTIONS,
  getTodayIsoDate,
  isFutureDate,
  isValidCustomerPhone,
  isPositiveAmount,
  isValidDate,
  emitCollectionDataChanged,
  validateReceiptFile,
} from "./utils";

type SaveCollectionPageProps = {
  staffNickname: string;
  onSaved?: () => void;
};

function SaveCollectionPage({ staffNickname, onSaved }: SaveCollectionPageProps) {
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitInFlightRef = useRef(false);
  const submitMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const isMountedRef = useRef(true);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestoreNotice, setDraftRestoreNotice] = useState<{
    restoredAt: string;
    hadPendingReceipts: boolean;
  } | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [batch, setBatch] = useState<CollectionBatch>("P10");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [receiptDrafts, setReceiptDrafts] = useState<CollectionReceiptDraftInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const maxPaymentDate = getTodayIsoDate();
  const isPaymentDateInFuture = paymentDate ? isFutureDate(paymentDate) : false;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const restoredDraft = readSaveCollectionDraft(staffNickname);
    if (restoredDraft) {
      setCustomerName(restoredDraft.customerName);
      setIcNumber(restoredDraft.icNumber);
      setCustomerPhone(restoredDraft.customerPhone);
      setAccountNumber(restoredDraft.accountNumber);
      setBatch(restoredDraft.batch);
      setPaymentDate(restoredDraft.paymentDate);
      setAmount(restoredDraft.amount);
      setDraftRestoreNotice({
        restoredAt: restoredDraft.savedAt,
        hadPendingReceipts: restoredDraft.hadPendingReceipts,
      });
    } else {
      setDraftRestoreNotice(null);
    }
    setDraftHydrated(true);
  }, [staffNickname]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    const timer = window.setTimeout(() => {
      persistSaveCollectionDraft(staffNickname, {
        customerName,
        icNumber,
        customerPhone,
        accountNumber,
        batch,
        paymentDate,
        amount,
        hadPendingReceipts: receiptFiles.length > 0,
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    accountNumber,
    amount,
    batch,
    customerName,
    draftHydrated,
    icNumber,
    paymentDate,
    receiptFiles.length,
    staffNickname,
    customerPhone,
  ]);

  const restoreNoticeLabel = useMemo(() => {
    if (!draftRestoreNotice?.restoredAt) {
      return null;
    }

    const restoredAt = new Date(draftRestoreNotice.restoredAt);
    if (Number.isNaN(restoredAt.getTime())) {
      return null;
    }

    return restoredAt.toLocaleString();
  }, [draftRestoreNotice?.restoredAt]);

  const clearForm = () => {
    setCustomerName("");
    setIcNumber("");
    setCustomerPhone("");
    setAccountNumber("");
    setBatch("P10");
    setPaymentDate("");
    setAmount("");
    setReceiptFiles([]);
    setReceiptDrafts([]);
    clearSaveCollectionDraft(staffNickname);
    setDraftRestoreNotice(null);
    submitMutationIntentRef.current = null;
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
      notifyMutationError({
        title: "Validation Error",
        description: error,
      });
      return;
    }

    const nextDraft = createEmptyCollectionReceiptDraft();
    setReceiptFiles((previous) => [...previous, file]);
    setReceiptDrafts((previous) => [...previous, nextDraft]);
  };

  const handleRemoveReceipt = (index: number) => {
    setReceiptFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setReceiptDrafts((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleClearPendingReceipts = () => {
    setReceiptFiles([]);
    setReceiptDrafts([]);
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
      notifyMutationError({
        title: "Validation Error",
        description: validationError,
      });
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const newReceiptMetadata: CollectionReceiptMetadata[] = receiptDrafts.map((draft) =>
        buildCollectionReceiptMetadataPayload(draft));
      const mutationPayload = {
        customerName: customerName.trim(),
        icNumber: icNumber.trim(),
        customerPhone: customerPhone.trim(),
        accountNumber: accountNumber.trim(),
        batch,
        paymentDate,
        amount: Number(amount),
        collectionStaffNickname: staffNickname.trim(),
        newReceiptMetadata,
      };
      const mutationFingerprint = buildCollectionMutationFingerprint({
        operation: "create",
        payload: mutationPayload,
        receiptFiles,
      });
      if (submitMutationIntentRef.current?.fingerprint !== mutationFingerprint) {
        submitMutationIntentRef.current = {
          fingerprint: mutationFingerprint,
          key: createCollectionMutationIdempotencyKey(),
        };
      }

      await createCollectionRecord(
        buildCollectionRecordFormData(mutationPayload, receiptFiles),
        {
          idempotencyFingerprint: submitMutationIntentRef.current.fingerprint,
          idempotencyKey: submitMutationIntentRef.current.key,
        },
      );

      notifyMutationSuccess({
        title: "Collection Saved",
        description: "Rekod collection berjaya disimpan.",
      });
      emitCollectionDataChanged();
      clearForm();
      onSaved?.();
    } catch (error: unknown) {
      notifyMutationError({
        title: "Failed to Save Collection",
        error,
        fallbackDescription: "Failed to save collection.",
      });
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  usePageShortcuts([
    {
      key: "s",
      ctrlOrMeta: true,
      allowInEditable: true,
      enabled: !submitting,
      handler: () => {
        void handleSubmit();
      },
    },
  ]);

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="space-y-3">
        <CardTitle className="text-xl">Simpan Collection Individual</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Draft auto-saves in this browser session.</span>
          <span>
            Use <span className="font-medium text-foreground">Ctrl/Cmd+S</span> to save quickly.
          </span>
        </div>
        {draftRestoreNotice ? (
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Draft restored.</span>
            {restoreNoticeLabel ? ` Last saved ${restoreNoticeLabel}.` : null}
            {draftRestoreNotice.hadPendingReceipts
              ? " Pending receipt files need to be uploaded again before saving."
              : null}
          </div>
        ) : null}
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
              pendingReceiptDrafts={receiptDrafts}
              inputRef={fileInputRef}
              disabled={submitting}
              onFileChange={handleReceiptChange}
              onPendingDraftChange={(index, patch) =>
                setReceiptDrafts((previous) =>
                  previous.map((draft, draftIndex) =>
                    draftIndex === index ? { ...draft, ...patch } : draft,
                  ),
                )}
              onRemovePending={handleRemoveReceipt}
              onClearPending={handleClearPendingReceipts}
              uploadLabel="Upload Receipt One by One"
              helperText="Tambah satu receipt pada satu masa. Status Existing, Pending Upload, dan perubahan simpan/buang akan ditunjukkan di bawah sebelum anda klik Save Collection."
            />
          </div>
        </div>

        <div
          className="flex flex-wrap justify-end gap-2"
          data-floating-ai-avoid="true"
        >
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
