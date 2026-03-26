import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutationFeedback } from "@/hooks/useMutationFeedback";
import {
  type CollectionBatch,
  type CollectionRecord,
  type CollectionRecordReceipt,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  buildCollectionMutationFingerprint,
  buildCollectionRecordFormData,
  createCollectionMutationIdempotencyKey,
  updateCollectionRecord,
} from "@/lib/api/collection-records";
import {
  buildCollectionReceiptMetadataPayload,
  buildCollectionReceiptValidationPreview,
  createCollectionReceiptDraftFromReceipt,
  createEmptyCollectionReceiptDraft,
  shouldBlockCollectionReceiptSave,
  type CollectionReceiptDraftInput,
} from "@/pages/collection/receipt-validation";
import { useCollectionReceiptInspection } from "@/pages/collection/useCollectionReceiptInspection";
import {
  COLLECTION_BATCH_OPTIONS,
  emitCollectionDataChanged,
  getTodayIsoDate,
  isFutureDate,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
  parseCollectionApiErrorDetails,
  validateReceiptFile,
} from "@/pages/collection/utils";

function cloneReceiptIds(receiptIds: string[]) {
  return Array.from(new Set(receiptIds.map((value) => String(value || "").trim()).filter(Boolean)));
}

type UseCollectionRecordEditArgs = {
  role: string;
  loadingNicknames: boolean;
  nicknameOptions: CollectionStaffNickname[];
  onRefresh: () => Promise<unknown>;
  onViewReceipt: (record: CollectionRecord, receiptId?: string) => void;
};

export function useCollectionRecordEdit({
  role,
  loadingNicknames,
  nicknameOptions,
  onRefresh,
  onViewReceipt,
}: UseCollectionRecordEditArgs) {
  const { notifyMutationError, notifyMutationSuccess } = useMutationFeedback();
  const isMountedRef = useRef(true);
  const savingEditInFlightRef = useRef(false);
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const editMutationIntentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const { inspectReceipt, cancelInspection, cancelAllInspections } = useCollectionReceiptInspection();

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
  const [editExistingReceiptDrafts, setEditExistingReceiptDrafts] = useState<CollectionReceiptDraftInput[]>([]);
  const [editPendingReceiptDrafts, setEditPendingReceiptDrafts] = useState<CollectionReceiptDraftInput[]>([]);
  const [editRemovedReceiptIds, setEditRemovedReceiptIds] = useState<string[]>([]);
  const [editReceiptValidationOverrideReason, setEditReceiptValidationOverrideReason] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const maxPaymentDate = getTodayIsoDate();
  const canOverrideReceiptValidation = role === "admin" || role === "superuser";
  const activeExistingReceiptDrafts = useMemo(
    () => {
      const removed = new Set(editRemovedReceiptIds);
      return editExistingReceiptDrafts.filter((draft) => !removed.has(String(draft.receiptId || "")));
    },
    [editExistingReceiptDrafts, editRemovedReceiptIds],
  );
  const editReceiptValidation = useMemo(
    () =>
      buildCollectionReceiptValidationPreview({
        totalPaid: editAmount,
        receipts: [...activeExistingReceiptDrafts, ...editPendingReceiptDrafts],
      }),
    [activeExistingReceiptDrafts, editAmount, editPendingReceiptDrafts],
  );
  const isEditReceiptSaveBlocked = shouldBlockCollectionReceiptSave({
    validation: editReceiptValidation,
    role,
    overrideReason: editReceiptValidationOverrideReason,
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelAllInspections();
    };
  }, [cancelAllInspections]);

  const applyPendingDraftPatch = useCallback((
    draftLocalId: string,
    patch: Partial<CollectionReceiptDraftInput>,
  ) => {
    setEditPendingReceiptDrafts((previous) =>
      previous.map((draft) =>
        draft.draftLocalId === draftLocalId ? { ...draft, ...patch } : draft,
      ),
    );
  }, []);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    setEditOpen(open);
    if (open) {
      return;
    }

    cancelAllInspections();
    setEditingRecord(null);
    setEditNewReceiptFiles([]);
    setEditExistingReceiptDrafts([]);
    setEditPendingReceiptDrafts([]);
    setEditRemovedReceiptIds([]);
    setEditReceiptValidationOverrideReason("");
    editMutationIntentRef.current = null;
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
  }, [cancelAllInspections]);

  const openEditDialog = useCallback((record: CollectionRecord) => {
    cancelAllInspections();
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
    setEditExistingReceiptDrafts(record.receipts.map((receipt) => createCollectionReceiptDraftFromReceipt(receipt)));
    setEditPendingReceiptDrafts([]);
    setEditRemovedReceiptIds([]);
    setEditReceiptValidationOverrideReason("");
    editMutationIntentRef.current = null;
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
    setEditOpen(true);
  }, [cancelAllInspections]);

  const handleEditReceiptChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    const error = validateReceiptFile(file);
    if (error) {
      notifyMutationError({
        title: "Validation Error",
        description: error,
      });
      return;
    }

    const nextDraft = createEmptyCollectionReceiptDraft();
    setEditNewReceiptFiles((previous) => [...previous, file]);
    setEditPendingReceiptDrafts((previous) => [...previous, nextDraft]);
    void inspectReceipt({
      file,
      draftLocalId: nextDraft.draftLocalId,
      applyDraftPatch: applyPendingDraftPatch,
      onError: (error) => {
        if (!isMountedRef.current) {
          return;
        }
        notifyMutationError({
          title: "Receipt Analysis Limited",
          error,
          fallbackDescription: "Analisis automatik gagal. Sila semak dan isi jumlah resit secara manual.",
        });
      },
    });
  }, [applyPendingDraftPatch, inspectReceipt, notifyMutationError]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord || savingEdit || savingEditInFlightRef.current) return;

    if (!editCustomerName.trim()) {
      notifyMutationError({
        title: "Validation Error",
        description: "Customer Name is required.",
      });
      return;
    }
    if (!editIcNumber.trim()) {
      notifyMutationError({
        title: "Validation Error",
        description: "IC Number is required.",
      });
      return;
    }
    if (!isValidCustomerPhone(editCustomerPhone)) {
      notifyMutationError({
        title: "Validation Error",
        description: "Customer Phone Number is invalid.",
      });
      return;
    }
    if (!editAccountNumber.trim()) {
      notifyMutationError({
        title: "Validation Error",
        description: "Account Number is required.",
      });
      return;
    }
    if (!COLLECTION_BATCH_OPTIONS.includes(editBatch)) {
      notifyMutationError({
        title: "Validation Error",
        description: "Batch is not valid.",
      });
      return;
    }
    if (!isValidDate(editPaymentDate)) {
      notifyMutationError({
        title: "Validation Error",
        description: "Payment Date is invalid.",
      });
      return;
    }
    if (isFutureDate(editPaymentDate)) {
      notifyMutationError({
        title: "Validation Error",
        description: "Payment Date cannot be in the future.",
      });
      return;
    }
    if (!isPositiveAmount(editAmount)) {
      notifyMutationError({
        title: "Validation Error",
        description: "Amount must be greater than 0.",
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
        notifyMutationError({
          title: "Validation Error",
          description: "Sila pilih Staff Nickname rasmi daripada senarai.",
        });
        return;
      }
    }
    if (isEditReceiptSaveBlocked) {
      notifyMutationError({
        title: "Receipt Validation Required",
        description: canOverrideReceiptValidation && editReceiptValidation.requiresOverride
          ? editReceiptValidationOverrideReason.trim()
            ? editReceiptValidation.message
            : "Sila masukkan sebab override sebelum simpan."
          : editReceiptValidation.message,
      });
      return;
    }

    savingEditInFlightRef.current = true;
    setSavingEdit(true);
    try {
      const existingReceiptMetadata = activeExistingReceiptDrafts.map((draft) =>
        buildCollectionReceiptMetadataPayload(draft));
      const newReceiptMetadata = editPendingReceiptDrafts.map((draft) =>
        buildCollectionReceiptMetadataPayload(draft));
      const payload: Record<string, unknown> = {
        customerName: editCustomerName.trim(),
        icNumber: editIcNumber.trim(),
        customerPhone: editCustomerPhone.trim(),
        accountNumber: editAccountNumber.trim(),
        batch: editBatch,
        paymentDate: editPaymentDate,
        amount: Number(editAmount),
        expectedUpdatedAt: editingRecord.updatedAt || editingRecord.createdAt,
        existingReceiptMetadata,
        newReceiptMetadata,
        receiptValidationOverrideReason: editReceiptValidation.requiresOverride
          ? editReceiptValidationOverrideReason.trim()
          : undefined,
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

      const mutationFingerprint = buildCollectionMutationFingerprint({
        operation: "update",
        payload,
        receiptFiles: editNewReceiptFiles,
        recordId: editingRecord.id,
      });
      if (editMutationIntentRef.current?.fingerprint !== mutationFingerprint) {
        editMutationIntentRef.current = {
          fingerprint: mutationFingerprint,
          key: createCollectionMutationIdempotencyKey(),
        };
      }

      await updateCollectionRecord(
        editingRecord.id,
        buildCollectionRecordFormData(payload, editNewReceiptFiles),
        {
          idempotencyFingerprint: editMutationIntentRef.current.fingerprint,
          idempotencyKey: editMutationIntentRef.current.key,
        },
      );
      notifyMutationSuccess({
        title: "Record Updated",
        description: "Rekod collection berjaya dikemaskini.",
      });
      emitCollectionDataChanged();
      if (!isMountedRef.current) return;
      setEditOpen(false);
      setEditingRecord(null);
      cancelAllInspections();
      setEditNewReceiptFiles([]);
      setEditExistingReceiptDrafts([]);
      setEditPendingReceiptDrafts([]);
      setEditRemovedReceiptIds([]);
      setEditReceiptValidationOverrideReason("");
      editMutationIntentRef.current = null;
      await onRefresh();
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      const apiErrorDetails = parseCollectionApiErrorDetails(error);
      if (
        apiErrorDetails.status === 409
        && apiErrorDetails.code === "COLLECTION_RECORD_VERSION_CONFLICT"
      ) {
        notifyMutationError({
          title: "Record Updated Elsewhere",
          description:
            "This record changed in another session. The list has been refreshed. Reopen the record and apply your changes again.",
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
        cancelAllInspections();
        setEditNewReceiptFiles([]);
        setEditExistingReceiptDrafts([]);
        setEditPendingReceiptDrafts([]);
        setEditRemovedReceiptIds([]);
        setEditReceiptValidationOverrideReason("");
        editMutationIntentRef.current = null;
        if (editReceiptInputRef.current) {
          editReceiptInputRef.current.value = "";
        }
        return;
      }

      notifyMutationError({
        title: "Failed to Update Record",
        description: apiErrorDetails.message,
        error,
        fallbackDescription: "Failed to update record.",
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
    editExistingReceiptDrafts,
    editIcNumber,
    editNewReceiptFiles,
    editPendingReceiptDrafts,
    editPaymentDate,
    editRemovedReceiptIds,
    editReceiptValidation,
    editReceiptValidationOverrideReason,
    editStaffNickname,
    editingRecord,
    activeExistingReceiptDrafts,
    canOverrideReceiptValidation,
    cancelAllInspections,
    isEditReceiptSaveBlocked,
    nicknameOptions,
    onRefresh,
    savingEdit,
    savingEditInFlightRef,
    notifyMutationError,
    notifyMutationSuccess,
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
      editExistingReceiptDrafts,
      editPendingReceiptDrafts,
      editReceiptValidation,
      editReceiptValidationOverrideReason,
      canOverrideReceiptValidation,
      isEditReceiptSaveBlocked,
      editRemovedReceiptIds,
      editReceiptInputRef,
      onOpenChange: handleEditDialogOpenChange,
      onCustomerNameChange: setEditCustomerName,
      onIcNumberChange: setEditIcNumber,
      onCustomerPhoneChange: setEditCustomerPhone,
      onAccountNumberChange: setEditAccountNumber,
      onBatchChange: setEditBatch,
      onPaymentDateChange: setEditPaymentDate,
      onAmountChange: setEditAmount,
      onStaffNicknameChange: setEditStaffNickname,
      onReceiptValidationOverrideReasonChange: setEditReceiptValidationOverrideReason,
      onReceiptChange: handleEditReceiptChange,
      onRemovePendingReceipt: (index: number) => {
        setEditNewReceiptFiles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
        setEditPendingReceiptDrafts((previous) => {
          const target = previous[index];
          if (target) {
            cancelInspection(target.draftLocalId);
          }
          return previous.filter((_, itemIndex) => itemIndex !== index);
        });
      },
      onClearPendingReceipts: () => {
        cancelAllInspections();
        setEditNewReceiptFiles([]);
        setEditPendingReceiptDrafts([]);
        if (editReceiptInputRef.current) {
          editReceiptInputRef.current.value = "";
        }
      },
      onExistingReceiptDraftChange: (receiptId: string, patch: Partial<CollectionReceiptDraftInput>) =>
        setEditExistingReceiptDrafts((previous) =>
          previous.map((draft) =>
            draft.receiptId === receiptId ? { ...draft, ...patch } : draft,
          )),
      onPendingReceiptDraftChange: (index: number, patch: Partial<CollectionReceiptDraftInput>) =>
        setEditPendingReceiptDrafts((previous) =>
          previous.map((draft, draftIndex) =>
            draftIndex === index ? { ...draft, ...patch } : draft,
          )),
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
