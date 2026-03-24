import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import {
  updateCollectionRecord,
  type CollectionBatch,
  type CollectionRecord,
  type CollectionRecordReceipt,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  COLLECTION_BATCH_OPTIONS,
  emitCollectionDataChanged,
  getTodayIsoDate,
  isFutureDate,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
  parseCollectionApiErrorDetails,
  parseApiError,
  toReceiptPayloads,
  validateReceiptFile,
} from "@/pages/collection/utils";

function cloneReceiptIds(receiptIds: string[]) {
  return Array.from(new Set(receiptIds.map((value) => String(value || "").trim()).filter(Boolean)));
}

type UseCollectionRecordEditArgs = {
  loadingNicknames: boolean;
  nicknameOptions: CollectionStaffNickname[];
  onRefresh: () => Promise<unknown>;
  onViewReceipt: (record: CollectionRecord, receiptId?: string) => void;
};

export function useCollectionRecordEdit({
  loadingNicknames,
  nicknameOptions,
  onRefresh,
  onViewReceipt,
}: UseCollectionRecordEditArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const savingEditInFlightRef = useRef(false);
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CollectionRecord | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editIcNumber, setEditIcNumber] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editBatch, setEditBatch] = useState<CollectionBatch>("P10");
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editStaffNickname, setEditStaffNickname] = useState("");
  const [editNewReceiptFiles, setEditNewReceiptFiles] = useState<File[]>([]);
  const [editRemovedReceiptIds, setEditRemovedReceiptIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const maxPaymentDate = getTodayIsoDate();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const openEditDialog = useCallback((record: CollectionRecord) => {
    setEditingRecord(record);
    setEditCustomerName(record.customerName);
    setEditIcNumber(record.icNumber);
    setEditCustomerPhone(record.customerPhone);
    setEditAccountNumber(record.accountNumber);
    setEditBatch(record.batch);
    setEditPaymentDate(record.paymentDate);
    setEditAmount(String(record.amount));
    setEditStaffNickname(record.collectionStaffNickname);
    setEditNewReceiptFiles([]);
    setEditRemovedReceiptIds([]);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
    setEditOpen(true);
  }, []);

  const handleEditReceiptChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    const error = validateReceiptFile(file);
    if (error) {
      toast({
        title: "Validation Error",
        description: error,
        variant: "destructive",
      });
      return;
    }

    setEditNewReceiptFiles((previous) => [...previous, file]);
  }, [toast]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord || savingEdit || savingEditInFlightRef.current) return;

    if (!editCustomerName.trim()) {
      toast({
        title: "Validation Error",
        description: "Customer Name is required.",
        variant: "destructive",
      });
      return;
    }
    if (!editIcNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "IC Number is required.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidCustomerPhone(editCustomerPhone)) {
      toast({
        title: "Validation Error",
        description: "Customer Phone Number is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (!editAccountNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "Account Number is required.",
        variant: "destructive",
      });
      return;
    }
    if (!COLLECTION_BATCH_OPTIONS.includes(editBatch)) {
      toast({
        title: "Validation Error",
        description: "Batch is not valid.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidDate(editPaymentDate)) {
      toast({
        title: "Validation Error",
        description: "Payment Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (isFutureDate(editPaymentDate)) {
      toast({
        title: "Validation Error",
        description: "Payment Date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }
    if (!isPositiveAmount(editAmount)) {
      toast({
        title: "Validation Error",
        description: "Amount must be greater than 0.",
        variant: "destructive",
      });
      return;
    }

    const normalizedEditNickname = editStaffNickname.trim();
    const staffNicknameChanged =
      normalizedEditNickname !== editingRecord.collectionStaffNickname;
    if (staffNicknameChanged) {
      const isOfficialNickname = nicknameOptions.some(
        (item) => item.nickname === normalizedEditNickname && item.isActive,
      );
      if (!isOfficialNickname) {
        toast({
          title: "Validation Error",
          description: "Sila pilih Staff Nickname rasmi daripada senarai.",
          variant: "destructive",
        });
        return;
      }
    }

    savingEditInFlightRef.current = true;
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {
        customerName: editCustomerName.trim(),
        icNumber: editIcNumber.trim(),
        customerPhone: editCustomerPhone.trim(),
        accountNumber: editAccountNumber.trim(),
        batch: editBatch,
        paymentDate: editPaymentDate,
        amount: Number(editAmount),
        expectedUpdatedAt: editingRecord.updatedAt || editingRecord.createdAt,
      };

      if (staffNicknameChanged) {
        payload.collectionStaffNickname = normalizedEditNickname;
      }

      const removeReceiptIds = cloneReceiptIds(editRemovedReceiptIds);
      if (removeReceiptIds.length > 0) {
        payload.removeReceiptIds = removeReceiptIds;
      }
      if (
        (editingRecord.receipts?.length || 0) > 0 &&
        removeReceiptIds.length === (editingRecord.receipts?.length || 0)
      ) {
        payload.removeReceipt = true;
      }
      if (editNewReceiptFiles.length > 0) {
        payload.receipts = await toReceiptPayloads(editNewReceiptFiles);
      }

      await updateCollectionRecord(editingRecord.id, payload);
      toast({
        title: "Record Updated",
        description: "Rekod collection berjaya dikemaskini.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) return;
      setEditOpen(false);
      setEditingRecord(null);
      setEditNewReceiptFiles([]);
      setEditRemovedReceiptIds([]);
      await onRefresh();
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      const apiErrorDetails = parseCollectionApiErrorDetails(error);
      if (
        apiErrorDetails.status === 409
        && apiErrorDetails.code === "COLLECTION_RECORD_VERSION_CONFLICT"
      ) {
        toast({
          title: "Record Updated Elsewhere",
          description:
            "This record changed in another session. The list has been refreshed. Reopen the record and apply your changes again.",
          variant: "destructive",
        });
        emitCollectionDataChanged();
        try {
          await onRefresh();
        } catch {
          // keep conflict UX deterministic even if refresh fails
        }
        if (!isMountedRef.current) return;
        setEditOpen(false);
        setEditingRecord(null);
        setEditNewReceiptFiles([]);
        setEditRemovedReceiptIds([]);
        if (editReceiptInputRef.current) {
          editReceiptInputRef.current.value = "";
        }
        return;
      }

      toast({
        title: "Failed to Update Record",
        description: apiErrorDetails.message || parseApiError(error),
        variant: "destructive",
      });
    } finally {
      savingEditInFlightRef.current = false;
      if (!isMountedRef.current) return;
      setSavingEdit(false);
    }
  }, [
    editAccountNumber,
    editAmount,
    editBatch,
    editCustomerName,
    editCustomerPhone,
    editIcNumber,
    editNewReceiptFiles,
    editPaymentDate,
    editRemovedReceiptIds,
    editStaffNickname,
    editingRecord,
    nicknameOptions,
    onRefresh,
    savingEdit,
    savingEditInFlightRef,
    toast,
  ]);

  return {
    openEditDialog,
    editDialog: {
      open: editOpen,
      savingEdit,
      loadingNicknames,
      editingRecord,
      nicknameOptions,
      batchOptions: COLLECTION_BATCH_OPTIONS,
      editCustomerName,
      editIcNumber,
      editCustomerPhone,
      editAccountNumber,
      editBatch,
      editPaymentDate,
      editAmount,
      editStaffNickname,
      maxPaymentDate,
      editNewReceiptFiles,
      editRemovedReceiptIds,
      editReceiptInputRef,
      onOpenChange: setEditOpen,
      onCustomerNameChange: setEditCustomerName,
      onIcNumberChange: setEditIcNumber,
      onCustomerPhoneChange: setEditCustomerPhone,
      onAccountNumberChange: setEditAccountNumber,
      onBatchChange: setEditBatch,
      onPaymentDateChange: setEditPaymentDate,
      onAmountChange: setEditAmount,
      onStaffNicknameChange: setEditStaffNickname,
      onReceiptChange: handleEditReceiptChange,
      onRemovePendingReceipt: (index: number) =>
        setEditNewReceiptFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index)),
      onClearPendingReceipts: () => {
        setEditNewReceiptFiles([]);
        if (editReceiptInputRef.current) {
          editReceiptInputRef.current.value = "";
        }
      },
      onToggleRemoveExistingReceipt: (receiptId: string) =>
        setEditRemovedReceiptIds((previous) => {
          const normalized = cloneReceiptIds(previous);
          return normalized.includes(receiptId)
            ? normalized.filter((value) => value !== receiptId)
            : [...normalized, receiptId];
        }),
      onViewExistingReceipt: (receipt: CollectionRecordReceipt) =>
        editingRecord ? onViewReceipt(editingRecord, receipt.id) : undefined,
      onSave: () => void handleSaveEdit(),
    },
  };
}
