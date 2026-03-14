import {
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/download";
import {
  deleteCollectionRecord,
  fetchCollectionReceiptBlob,
  getCollectionNicknames,
  getCollectionRecords,
  updateCollectionRecord,
  type CollectionBatch,
  type CollectionRecord,
  type CollectionStaffNickname,
} from "@/lib/api";
import type { ReceiptPreviewKind } from "@/pages/collection-records/types";
import {
  inferReceiptMimeTypeFromName,
  resolveReceiptPreviewKind,
} from "@/pages/collection-records/utils";
import {
  COLLECTION_BATCH_OPTIONS,
  computeSummary,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
  parseApiError,
  toReceiptPayload,
  validateReceiptFile,
} from "@/pages/collection/utils";

type UseCollectionRecordsControllerParams = {
  role: string;
};

type RecordFilters = {
  from?: string;
  to?: string;
  search?: string;
  nickname?: string;
};

export function useCollectionRecordsController({
  role,
}: UseCollectionRecordsControllerParams) {
  const { toast } = useToast();
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const recordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const receiptPreviewRequestIdRef = useRef(0);
  const skipInitialAutoFetchRef = useRef(true);
  const skipNextAutoFetchRef = useRef(false);

  const canEdit = role === "user" || role === "admin" || role === "superuser";
  const canDeleteGlobal = role === "admin" || role === "superuser" || role === "user";
  const canUseNicknameFilter = role === "admin" || role === "superuser";

  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [nicknameFilter, setNicknameFilter] = useState<string>("all");
  const [loadingNicknames, setLoadingNicknames] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

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
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editRemoveReceipt, setEditRemoveReceipt] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [pendingDeleteRecord, setPendingDeleteRecord] =
    useState<CollectionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [viewAllRecords, setViewAllRecords] = useState<CollectionRecord[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewRecord, setReceiptPreviewRecord] =
    useState<CollectionRecord | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = useState(false);
  const [receiptPreviewSource, setReceiptPreviewSource] = useState("");
  const [receiptPreviewMimeType, setReceiptPreviewMimeType] = useState("");
  const [receiptPreviewFileName, setReceiptPreviewFileName] = useState("");
  const [receiptPreviewError, setReceiptPreviewError] = useState("");

  const deferredSearchInput = useDeferredValue(searchInput);

  const receiptPreviewKind = useMemo<ReceiptPreviewKind>(
    () =>
      resolveReceiptPreviewKind({
        mimeType: receiptPreviewMimeType,
        fileName: receiptPreviewFileName,
        receiptPath: receiptPreviewRecord?.receiptFile || "",
      }),
    [receiptPreviewFileName, receiptPreviewMimeType, receiptPreviewRecord?.receiptFile],
  );

  const visibleRecords = records;
  const summary = useMemo(() => computeSummary(records), [records]);
  const viewAllSummary = useMemo(
    () => computeSummary(viewAllRecords),
    [viewAllRecords],
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleRecords.length / tablePageSize)),
    [tablePageSize, visibleRecords.length],
  );
  const paginatedRecords = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return visibleRecords.slice(start, start + tablePageSize);
  }, [tablePage, tablePageSize, visibleRecords]);
  const pagedStart = visibleRecords.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const pagedEnd = Math.min(visibleRecords.length, tablePage * tablePageSize);

  const buildCurrentFilters = useCallback(
    (searchValue = searchInput.trim()): RecordFilters => ({
      from: fromDate || undefined,
      to: toDate || undefined,
      search: searchValue || undefined,
      nickname:
        canUseNicknameFilter && nicknameFilter !== "all"
          ? nicknameFilter
          : undefined,
    }),
    [canUseNicknameFilter, fromDate, nicknameFilter, searchInput, toDate],
  );

  const clearReceiptPreviewObjectUrl = useCallback(() => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
  }, []);

  const closeReceiptPreview = useCallback(() => {
    receiptPreviewRequestIdRef.current += 1;
    clearReceiptPreviewObjectUrl();
    setReceiptPreviewOpen(false);
    setReceiptPreviewRecord(null);
    setReceiptPreviewLoading(false);
    setReceiptPreviewDownloading(false);
    setReceiptPreviewSource("");
    setReceiptPreviewMimeType("");
    setReceiptPreviewFileName("");
    setReceiptPreviewError("");
  }, [clearReceiptPreviewObjectUrl]);

  useEffect(() => {
    return () => {
      clearReceiptPreviewObjectUrl();
      isMountedRef.current = false;
    };
  }, [clearReceiptPreviewObjectUrl]);

  useEffect(() => {
    setTablePage(1);
  }, [fromDate, nicknameFilter, searchInput, tablePageSize, toDate]);

  useEffect(() => {
    if (tablePage > totalPages) {
      setTablePage(totalPages);
    }
  }, [tablePage, totalPages]);

  const loadNicknames = useCallback(async () => {
    const requestId = ++nicknamesRequestIdRef.current;
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames();
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const options = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(options);
      setNicknameFilter((previous) =>
        previous !== "all" && !options.some((item) => item.nickname === previous)
          ? "all"
          : previous,
      );
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      setLoadingNicknames(false);
    }
  }, [toast]);

  const loadRecords = useCallback(
    async (filters?: RecordFilters) => {
      const requestId = ++recordsRequestIdRef.current;
      setLoadingRecords(true);
      try {
        const response = await getCollectionRecords(filters);
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        setRecords(Array.isArray(response?.records) ? response.records : []);
        setTablePage(1);
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        toast({
          title: "Failed to Load Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (!isMountedRef.current || requestId !== recordsRequestIdRef.current) return;
        setLoadingRecords(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  useEffect(() => {
    const trimmedSearch = deferredSearchInput.trim();
    if (skipInitialAutoFetchRef.current) {
      skipInitialAutoFetchRef.current = false;
      return;
    }
    if (skipNextAutoFetchRef.current) {
      skipNextAutoFetchRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      if (fromDate && !isValidDate(fromDate)) return;
      if (toDate && !isValidDate(toDate)) return;
      if (fromDate && toDate && fromDate > toDate) return;
      void loadRecords(buildCurrentFilters(trimmedSearch));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [buildCurrentFilters, deferredSearchInput, fromDate, loadRecords, toDate]);

  const handleFilter = useCallback(async () => {
    if (fromDate && !isValidDate(fromDate)) {
      toast({
        title: "Validation Error",
        description: "From Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (toDate && !isValidDate(toDate)) {
      toast({
        title: "Validation Error",
        description: "To Date is invalid.",
        variant: "destructive",
      });
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast({
        title: "Validation Error",
        description: "From Date cannot be later than To Date.",
        variant: "destructive",
      });
      return;
    }
    await loadRecords(buildCurrentFilters());
  }, [buildCurrentFilters, fromDate, loadRecords, toDate, toast]);

  const handleResetFilter = useCallback(async () => {
    skipNextAutoFetchRef.current = true;
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setNicknameFilter("all");
    await loadRecords();
  }, [loadRecords]);

  const handleOpenViewAll = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast({
        title: "Tarikh Diperlukan",
        description: "Sila pilih From Date dan To Date terlebih dahulu.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidDate(fromDate) || !isValidDate(toDate) || fromDate > toDate) {
      toast({
        title: "Validation Error",
        description: "Date range tidak sah.",
        variant: "destructive",
      });
      return;
    }

    setViewAllLoading(true);
    try {
      const response = await getCollectionRecords({ from: fromDate, to: toDate });
      if (!isMountedRef.current) return;
      setViewAllRecords(Array.isArray(response?.records) ? response.records : []);
      setViewAllOpen(true);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Load Full Listing",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setViewAllLoading(false);
    }
  }, [fromDate, toDate, toast]);

  const handleReceiptPreviewOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setReceiptPreviewOpen(true);
        return;
      }
      closeReceiptPreview();
    },
    [closeReceiptPreview],
  );

  const handleViewReceipt = useCallback(
    async (record: CollectionRecord) => {
      if (!record.receiptFile) return;

      const requestId = ++receiptPreviewRequestIdRef.current;
      clearReceiptPreviewObjectUrl();
      setReceiptPreviewRecord(record);
      setReceiptPreviewOpen(true);
      setReceiptPreviewLoading(true);
      setReceiptPreviewDownloading(false);
      setReceiptPreviewSource("");
      setReceiptPreviewMimeType("");
      setReceiptPreviewFileName("");
      setReceiptPreviewError("");

      try {
        const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(
          record.id,
          "view",
        );
        const normalizedFileName = fileName || `receipt-${record.id}`;
        const normalizedMimeType =
          String(mimeType || "").toLowerCase() ||
          inferReceiptMimeTypeFromName(normalizedFileName) ||
          inferReceiptMimeTypeFromName(record.receiptFile || "");

        const previewBlob =
          normalizedMimeType && blob.type !== normalizedMimeType
            ? new Blob([blob], { type: normalizedMimeType })
            : blob;

        const objectUrl = URL.createObjectURL(previewBlob);
        if (
          !isMountedRef.current ||
          requestId !== receiptPreviewRequestIdRef.current
        ) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        receiptPreviewUrlRef.current = objectUrl;
        setReceiptPreviewSource(objectUrl);
        setReceiptPreviewMimeType(normalizedMimeType || previewBlob.type || "");
        setReceiptPreviewFileName(normalizedFileName);
      } catch (error: unknown) {
        if (
          !isMountedRef.current ||
          requestId !== receiptPreviewRequestIdRef.current
        ) {
          return;
        }

        const message = parseApiError(error);
        const expectedKind = resolveReceiptPreviewKind({
          fileName: record.receiptFile || "",
          receiptPath: record.receiptFile || "",
        });
        if (expectedKind === "pdf") {
          setReceiptPreviewError(
            "PDF preview is unavailable. You can still download the file.",
          );
        } else if (message.toLowerCase().includes("preview not available")) {
          setReceiptPreviewError("Preview not available for this file type.");
        } else {
          setReceiptPreviewError(message);
        }
      } finally {
        if (
          !isMountedRef.current ||
          requestId !== receiptPreviewRequestIdRef.current
        ) {
          return;
        }
        setReceiptPreviewLoading(false);
      }
    },
    [clearReceiptPreviewObjectUrl],
  );

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;

    setReceiptPreviewDownloading(true);
    try {
      const { blob, fileName } = await fetchCollectionReceiptBlob(
        receiptPreviewRecord.id,
        "download",
      );
      downloadBlob(
        blob,
        fileName || receiptPreviewFileName || `receipt-${receiptPreviewRecord.id}`,
      );
    } catch (error: unknown) {
      toast({
        title: "Download Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setReceiptPreviewDownloading(false);
    }
  }, [receiptPreviewDownloading, receiptPreviewFileName, receiptPreviewRecord, toast]);

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
    setEditReceiptFile(null);
    setEditRemoveReceipt(false);
    setEditOpen(true);
  }, []);

  const handleEditReceiptChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      if (!file) {
        setEditReceiptFile(null);
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
      setEditReceiptFile(file);
    },
    [toast],
  );

  const handleClearEditReceipt = useCallback(() => {
    setEditReceiptFile(null);
    if (editReceiptInputRef.current) {
      editReceiptInputRef.current.value = "";
    }
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord || savingEdit) return;

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
    if (editReceiptFile && editRemoveReceipt) {
      toast({
        title: "Validation Error",
        description: "Pilih sama ada upload resit baru atau remove resit lama.",
        variant: "destructive",
      });
      return;
    }

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
      };

      if (staffNicknameChanged) {
        payload.collectionStaffNickname = normalizedEditNickname;
      }

      if (editRemoveReceipt) payload.removeReceipt = true;
      if (!editRemoveReceipt && editReceiptFile) {
        payload.receipt = await toReceiptPayload(editReceiptFile);
      }

      await updateCollectionRecord(editingRecord.id, payload);
      toast({
        title: "Record Updated",
        description: "Rekod collection berjaya dikemaskini.",
      });
      if (!isMountedRef.current) return;
      setEditOpen(false);
      setEditingRecord(null);
      await loadRecords(buildCurrentFilters());
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Update Record",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setSavingEdit(false);
    }
  }, [
    buildCurrentFilters,
    editAccountNumber,
    editAmount,
    editBatch,
    editCustomerName,
    editCustomerPhone,
    editIcNumber,
    editPaymentDate,
    editReceiptFile,
    editRemoveReceipt,
    editStaffNickname,
    editingRecord,
    loadRecords,
    nicknameOptions,
    savingEdit,
    toast,
  ]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteRecord || deletingId) return;
    setDeletingId(pendingDeleteRecord.id);
    try {
      await deleteCollectionRecord(pendingDeleteRecord.id);
      toast({
        title: "Record Deleted",
        description: "Rekod collection berjaya dipadam.",
      });
      if (!isMountedRef.current) return;
      setPendingDeleteRecord(null);
      await loadRecords(buildCurrentFilters());
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Delete Record",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setDeletingId(null);
    }
  }, [buildCurrentFilters, deletingId, loadRecords, pendingDeleteRecord, toast]);

  const handleExportExcel = useCallback(async () => {
    if (visibleRecords.length === 0 || exportingExcel) {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    setExportingExcel(true);
    try {
      const { exportCollectionRecordsToExcel } = await import(
        "@/pages/collection-records/export"
      );
      await exportCollectionRecordsToExcel({
        visibleRecords,
        fromDate,
        toDate,
        summary,
        canUseNicknameFilter,
        nicknameFilter,
      });
    } catch (error: unknown) {
      toast({
        title: "Export Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setExportingExcel(false);
    }
  }, [
    canUseNicknameFilter,
    exportingExcel,
    fromDate,
    nicknameFilter,
    summary,
    toDate,
    toast,
    visibleRecords,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (visibleRecords.length === 0 || exportingPdf) {
      toast({
        title: "Tiada Data",
        description: "Tiada rekod untuk diexport.",
        variant: "destructive",
      });
      return;
    }

    setExportingPdf(true);
    try {
      const { exportCollectionRecordsToPdf } = await import(
        "@/pages/collection-records/export"
      );
      await exportCollectionRecordsToPdf({
        visibleRecords,
        fromDate,
        toDate,
        summary,
        canUseNicknameFilter,
        nicknameFilter,
      });
    } catch (error: unknown) {
      toast({
        title: "Export Failed",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setExportingPdf(false);
    }
  }, [
    canUseNicknameFilter,
    exportingPdf,
    fromDate,
    nicknameFilter,
    summary,
    toDate,
    toast,
    visibleRecords,
  ]);

  return {
    canEdit,
    canDeleteGlobal,
    canUseNicknameFilter,
    filters: {
      fromDate,
      toDate,
      searchInput,
      nicknameFilter,
      nicknameOptions,
      loadingNicknames,
      loadingRecords,
      onFromDateChange: setFromDate,
      onToDateChange: setToDate,
      onSearchInputChange: setSearchInput,
      onNicknameFilterChange: setNicknameFilter,
      onFilter: () => void handleFilter(),
      onReset: () => void handleResetFilter(),
    },
    table: {
      visibleRecords,
      paginatedRecords,
      summary,
      loadingRecords,
      pagedStart,
      pagedEnd,
      tablePage,
      totalPages,
      tablePageSize,
      onTablePageSizeChange: setTablePageSize,
      onPrevPage: () => setTablePage((previous) => Math.max(1, previous - 1)),
      onNextPage: () =>
        setTablePage((previous) => Math.min(totalPages, previous + 1)),
      onEdit: openEditDialog,
      onDelete: setPendingDeleteRecord,
      onViewReceipt: (record: CollectionRecord) => void handleViewReceipt(record),
      canDeleteRow: (_record: CollectionRecord) => canDeleteGlobal,
    },
    toolbar: {
      summary,
      loadingRecords,
      viewAllLoading,
      exportingExcel,
      exportingPdf,
      pagedStart,
      pagedEnd,
      visibleRecordsLength: visibleRecords.length,
      tablePage,
      totalPages,
      tablePageSize,
      onOpenViewAll: () => void handleOpenViewAll(),
      onExportExcel: () => void handleExportExcel(),
      onExportPdf: () => void handleExportPdf(),
      onTablePageSizeChange: setTablePageSize,
      onPrevPage: () => setTablePage((previous) => Math.max(1, previous - 1)),
      onNextPage: () =>
        setTablePage((previous) => Math.min(totalPages, previous + 1)),
    },
    receiptPreview: {
      open: receiptPreviewOpen,
      record: receiptPreviewRecord,
      loading: receiptPreviewLoading,
      downloading: receiptPreviewDownloading,
      source: receiptPreviewSource,
      fileName: receiptPreviewFileName,
      error: receiptPreviewError,
      kind: receiptPreviewKind,
      onOpenChange: handleReceiptPreviewOpenChange,
      onDownload: () => void handleDownloadReceipt(),
      onClose: closeReceiptPreview,
    },
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
      editReceiptFile,
      editRemoveReceipt,
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
      onClearReceipt: handleClearEditReceipt,
      onToggleRemoveReceipt: () => setEditRemoveReceipt((previous) => !previous),
      onSave: () => void handleSaveEdit(),
    },
    deleteDialog: {
      open: Boolean(pendingDeleteRecord),
      deleting: deletingId !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPendingDeleteRecord(null);
      },
      onConfirm: () => void handleConfirmDelete(),
    },
    viewAll: {
      open: viewAllOpen,
      fromDate,
      toDate,
      records: viewAllRecords,
      summary: viewAllSummary,
      onOpenChange: setViewAllOpen,
      onViewReceipt: (record: CollectionRecord) => void handleViewReceipt(record),
    },
  };
}
