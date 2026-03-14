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
  getCollectionPurgeSummary,
  getCollectionRecords,
  purgeOldCollectionRecords,
  updateCollectionRecord,
  type CollectionBatch,
  type CollectionPurgeSummaryResponse,
  type CollectionRecord,
  type CollectionRecordReceipt,
  type CollectionStaffNickname,
} from "@/lib/api";
import { optimizeImageBlobForPreview } from "@/pages/collection-records/preview";
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
  limit?: number;
  offset?: number;
};

function cloneReceiptIds(receiptIds: string[]) {
  return Array.from(new Set(receiptIds.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function useCollectionRecordsController({
  role,
}: UseCollectionRecordsControllerParams) {
  const { toast } = useToast();
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const recordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const purgeSummaryRequestIdRef = useRef(0);
  const viewAllRequestIdRef = useRef(0);
  const receiptPreviewRequestIdRef = useRef(0);
  const skipInitialAutoFetchRef = useRef(true);
  const skipNextAutoFetchRef = useRef(false);

  const canEdit = role === "user" || role === "admin" || role === "superuser";
  const canDeleteGlobal = role === "admin" || role === "superuser" || role === "user";
  const canUseNicknameFilter = role === "admin" || role === "superuser";
  const canPurgeOldRecords = role === "superuser";

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
  const [editNewReceiptFiles, setEditNewReceiptFiles] = useState<File[]>([]);
  const [editRemovedReceiptIds, setEditRemovedReceiptIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [pendingDeleteRecord, setPendingDeleteRecord] =
    useState<CollectionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [viewAllRecords, setViewAllRecords] = useState<CollectionRecord[]>([]);
  const [viewAllFiltersSnapshot, setViewAllFiltersSnapshot] = useState<RecordFilters | null>(null);
  const [viewAllPage, setViewAllPage] = useState(1);
  const [viewAllPageSize, setViewAllPageSize] = useState(10);
  const [viewAllTotalRecords, setViewAllTotalRecords] = useState(0);
  const [viewAllTotalAmount, setViewAllTotalAmount] = useState(0);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeSummaryLoading, setPurgeSummaryLoading] = useState(false);
  const [purgingOldRecords, setPurgingOldRecords] = useState(false);
  const [purgeSummary, setPurgeSummary] = useState<CollectionPurgeSummaryResponse | null>(null);
  const [purgePasswordInput, setPurgePasswordInput] = useState("");

  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewRecord, setReceiptPreviewRecord] =
    useState<CollectionRecord | null>(null);
  const [receiptPreviewReceiptId, setReceiptPreviewReceiptId] = useState<string | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = useState(false);
  const [receiptPreviewSource, setReceiptPreviewSource] = useState("");
  const [receiptPreviewMimeType, setReceiptPreviewMimeType] = useState("");
  const [receiptPreviewFileName, setReceiptPreviewFileName] = useState("");
  const [receiptPreviewError, setReceiptPreviewError] = useState("");

  const deferredSearchInput = useDeferredValue(searchInput);

  const selectedPreviewReceipt = useMemo(() => {
    if (!receiptPreviewRecord) return null;
    if (!receiptPreviewReceiptId) return receiptPreviewRecord.receipts?.[0] || null;
    return (
      receiptPreviewRecord.receipts?.find((receipt) => receipt.id === receiptPreviewReceiptId) ||
      receiptPreviewRecord.receipts?.[0] ||
      null
    );
  }, [receiptPreviewReceiptId, receiptPreviewRecord]);

  const receiptPreviewKind = useMemo<ReceiptPreviewKind>(
    () =>
      resolveReceiptPreviewKind({
        mimeType: receiptPreviewMimeType || selectedPreviewReceipt?.originalMimeType || "",
        fileName: receiptPreviewFileName || selectedPreviewReceipt?.originalFileName || "",
        receiptPath: receiptPreviewRecord?.receiptFile || "",
      }),
    [
      receiptPreviewFileName,
      receiptPreviewMimeType,
      receiptPreviewRecord?.receiptFile,
      selectedPreviewReceipt?.originalFileName,
      selectedPreviewReceipt?.originalMimeType,
    ],
  );

  const visibleRecords = records;
  const summary = useMemo(() => computeSummary(records), [records]);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleRecords.length / tablePageSize)),
    [tablePageSize, visibleRecords.length],
  );
  const viewAllTotalPages = useMemo(
    () => Math.max(1, Math.ceil(viewAllTotalRecords / viewAllPageSize)),
    [viewAllPageSize, viewAllTotalRecords],
  );
  const paginatedRecords = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return visibleRecords.slice(start, start + tablePageSize);
  }, [tablePage, tablePageSize, visibleRecords]);
  const pagedStart = visibleRecords.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const pagedEnd = Math.min(visibleRecords.length, tablePage * tablePageSize);

  const buildCurrentFilters = useCallback(
    (searchValue = searchInput.trim(), limit = 1000, offset = 0): RecordFilters => ({
      from: fromDate || undefined,
      to: toDate || undefined,
      search: searchValue || undefined,
      nickname:
        canUseNicknameFilter && nicknameFilter !== "all"
          ? nicknameFilter
          : undefined,
      limit,
      offset,
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
    setReceiptPreviewReceiptId(null);
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

  const loadPurgeSummary = useCallback(async () => {
    if (!canPurgeOldRecords) return;

    const requestId = ++purgeSummaryRequestIdRef.current;
    setPurgeSummaryLoading(true);
    try {
      const response = await getCollectionPurgeSummary();
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      setPurgeSummary(response);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      toast({
        title: "Failed to Load Purge Summary",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== purgeSummaryRequestIdRef.current) return;
      setPurgeSummaryLoading(false);
    }
  }, [canPurgeOldRecords, toast]);

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
    if (!canPurgeOldRecords) return;
    void loadPurgeSummary();
  }, [canPurgeOldRecords, loadPurgeSummary]);

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

  const handleResetFilter = useCallback(() => {
    skipNextAutoFetchRef.current = true;
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setNicknameFilter("all");
    void loadRecords();
  }, [loadRecords]);

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

  const closeViewAll = useCallback(() => {
    viewAllRequestIdRef.current += 1;
    setViewAllOpen(false);
    setViewAllLoading(false);
    setViewAllRecords([]);
    setViewAllFiltersSnapshot(null);
    setViewAllPage(1);
    setViewAllPageSize(10);
    setViewAllTotalRecords(0);
    setViewAllTotalAmount(0);
  }, []);

  const handleOpenViewAll = useCallback(() => {
    if (viewAllLoading) return;
    setViewAllPage(1);
    setViewAllFiltersSnapshot(buildCurrentFilters(searchInput.trim(), viewAllPageSize, 0));
    setViewAllOpen(true);
  }, [buildCurrentFilters, searchInput, viewAllLoading, viewAllPageSize]);

  const handleOpenPurgeDialog = useCallback(() => {
    if (!canPurgeOldRecords || purgingOldRecords) return;
    void loadPurgeSummary();
    setPurgePasswordInput("");
    setPurgeDialogOpen(true);
  }, [canPurgeOldRecords, loadPurgeSummary, purgingOldRecords]);

  const handlePurgeDialogOpenChange = useCallback((open: boolean) => {
    setPurgeDialogOpen(open);
    if (!open) {
      setPurgePasswordInput("");
    }
  }, []);

  const handleViewReceipt = useCallback((record: CollectionRecord, receiptId?: string) => {
    const nextReceiptId = receiptId || record.receipts?.[0]?.id || null;
    setReceiptPreviewRecord(record);
    setReceiptPreviewReceiptId(nextReceiptId);
    setReceiptPreviewOpen(true);
  }, []);

  useEffect(() => {
    if (!receiptPreviewOpen || !receiptPreviewRecord) return;

    const activeRequestId = ++receiptPreviewRequestIdRef.current;
    const selectedReceiptId = selectedPreviewReceipt?.id || null;

    const loadPreview = async () => {
      setReceiptPreviewLoading(true);
      setReceiptPreviewError("");
      clearReceiptPreviewObjectUrl();

      try {
        const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(
          receiptPreviewRecord.id,
          "view",
          selectedReceiptId,
        );
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }

        const effectiveMimeType =
          mimeType ||
          selectedPreviewReceipt?.originalMimeType ||
          inferReceiptMimeTypeFromName(fileName || "");
        const previewBlob =
          effectiveMimeType.startsWith("image/")
            ? await optimizeImageBlobForPreview(blob)
            : blob;
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }

        const objectUrl = URL.createObjectURL(previewBlob);
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        receiptPreviewUrlRef.current = objectUrl;
        setReceiptPreviewSource(objectUrl);
        setReceiptPreviewMimeType(
          previewBlob.type || effectiveMimeType || "application/octet-stream",
        );
        setReceiptPreviewFileName(
          fileName ||
            selectedPreviewReceipt?.originalFileName ||
            receiptPreviewRecord.receiptFile ||
            "",
        );
      } catch (error: unknown) {
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }
        setReceiptPreviewSource("");
        setReceiptPreviewMimeType(
          selectedPreviewReceipt?.originalMimeType ||
            inferReceiptMimeTypeFromName(selectedPreviewReceipt?.originalFileName || ""),
        );
        setReceiptPreviewFileName(
          selectedPreviewReceipt?.originalFileName || receiptPreviewRecord.receiptFile || "",
        );
        setReceiptPreviewError(parseApiError(error));
      } finally {
        if (!isMountedRef.current || activeRequestId !== receiptPreviewRequestIdRef.current) {
          return;
        }
        setReceiptPreviewLoading(false);
      }
    };

    void loadPreview();
  }, [
    clearReceiptPreviewObjectUrl,
    receiptPreviewOpen,
    receiptPreviewRecord,
    selectedPreviewReceipt,
  ]);

  useEffect(() => {
    if (!viewAllOpen || !viewAllFiltersSnapshot) return;

    const requestId = ++viewAllRequestIdRef.current;
    setViewAllLoading(true);

    const loadViewAllPage = async () => {
      try {
        const response = await getCollectionRecords({
          ...viewAllFiltersSnapshot,
          limit: viewAllPageSize,
          offset: (viewAllPage - 1) * viewAllPageSize,
        });
        if (!isMountedRef.current || requestId !== viewAllRequestIdRef.current) return;
        setViewAllRecords(Array.isArray(response?.records) ? response.records : []);
        setViewAllTotalRecords(Number(response?.total || 0));
        setViewAllTotalAmount(Number(response?.totalAmount || 0));
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== viewAllRequestIdRef.current) return;
        setViewAllRecords([]);
        setViewAllTotalRecords(0);
        setViewAllTotalAmount(0);
        toast({
          title: "Failed to Load Full Records",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (!isMountedRef.current || requestId !== viewAllRequestIdRef.current) return;
        setViewAllLoading(false);
      }
    };

    void loadViewAllPage();
  }, [toast, viewAllFiltersSnapshot, viewAllOpen, viewAllPage, viewAllPageSize]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;
    setReceiptPreviewDownloading(true);
    try {
      const { blob, fileName } = await fetchCollectionReceiptBlob(
        receiptPreviewRecord.id,
        "download",
        selectedPreviewReceipt?.id,
      );
      downloadBlob(
        blob,
        fileName ||
          selectedPreviewReceipt?.originalFileName ||
          receiptPreviewRecord.receiptFile ||
          "receipt",
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
  }, [receiptPreviewDownloading, receiptPreviewRecord, selectedPreviewReceipt, toast]);

  const handleReceiptPreviewOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeReceiptPreview();
    } else {
      setReceiptPreviewOpen(true);
    }
  }, [closeReceiptPreview]);

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
        payload.receipts = await Promise.all(
          editNewReceiptFiles.map((file) => toReceiptPayload(file)),
        );
      }

      await updateCollectionRecord(editingRecord.id, payload);
      toast({
        title: "Record Updated",
        description: "Rekod collection berjaya dikemaskini.",
      });
      if (!isMountedRef.current) return;
      setEditOpen(false);
      setEditingRecord(null);
      setEditNewReceiptFiles([]);
      setEditRemovedReceiptIds([]);
      await Promise.all([
        loadRecords(buildCurrentFilters()),
        canPurgeOldRecords ? loadPurgeSummary() : Promise.resolve(),
      ]);
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
    editNewReceiptFiles,
    editPaymentDate,
    editRemovedReceiptIds,
    editStaffNickname,
    editingRecord,
    canPurgeOldRecords,
    loadPurgeSummary,
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
      await Promise.all([
        loadRecords(buildCurrentFilters()),
        canPurgeOldRecords ? loadPurgeSummary() : Promise.resolve(),
      ]);
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
  }, [buildCurrentFilters, canPurgeOldRecords, deletingId, loadPurgeSummary, loadRecords, pendingDeleteRecord, toast]);

  const handleConfirmPurgeOldRecords = useCallback(async () => {
    if (!canPurgeOldRecords || purgingOldRecords) return;
    if (!purgePasswordInput) {
      toast({
        title: "Password Required",
        description: "Masukkan password login superuser untuk teruskan purge.",
        variant: "destructive",
      });
      return;
    }

    setPurgingOldRecords(true);
    try {
      const response = await purgeOldCollectionRecords(purgePasswordInput);
      toast({
        title: response.deletedRecords > 0 ? "Purge Completed" : "No Old Records Found",
        description:
          response.deletedRecords > 0
            ? `${response.deletedRecords} rekod collection lama berjaya dipadam.`
            : "Tiada rekod collection melebihi enam bulan untuk dipurge.",
      });
      if (!isMountedRef.current) return;
      setPurgeDialogOpen(false);
      setPurgePasswordInput("");
      await Promise.all([
        loadRecords(buildCurrentFilters()),
        loadPurgeSummary(),
      ]);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      toast({
        title: "Failed to Purge Old Records",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setPurgingOldRecords(false);
    }
  }, [buildCurrentFilters, canPurgeOldRecords, loadPurgeSummary, loadRecords, purgePasswordInput, purgingOldRecords, toast]);

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
    canPurgeOldRecords,
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
      pageOffset: Math.max(0, (tablePage - 1) * tablePageSize),
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
      canPurgeOldRecords,
      purgeSummaryLoading,
      purgingOldRecords,
      purgeSummary: purgeSummary
        ? {
            cutoffDate: purgeSummary.cutoffDate,
            eligibleRecords: purgeSummary.eligibleRecords,
            totalAmount: purgeSummary.totalAmount,
          }
        : null,
      pagedStart,
      pagedEnd,
      visibleRecordsLength: visibleRecords.length,
      tablePage,
      totalPages,
      tablePageSize,
      onOpenViewAll: () => void handleOpenViewAll(),
      onOpenPurgeDialog: () => void handleOpenPurgeDialog(),
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
      receipts: receiptPreviewRecord?.receipts || [],
      selectedReceiptId: selectedPreviewReceipt?.id || null,
      loading: receiptPreviewLoading,
      downloading: receiptPreviewDownloading,
      source: receiptPreviewSource,
      fileName: receiptPreviewFileName,
      error: receiptPreviewError,
      kind: receiptPreviewKind,
      onOpenChange: handleReceiptPreviewOpenChange,
      onSelectReceipt: setReceiptPreviewReceiptId,
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
        editingRecord ? handleViewReceipt(editingRecord, receipt.id) : undefined,
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
    purgeDialog: {
      open: purgeDialogOpen,
      loading: purgeSummaryLoading,
      purging: purgingOldRecords,
      passwordInput: purgePasswordInput,
      summary: purgeSummary
        ? {
            cutoffDate: purgeSummary.cutoffDate,
            eligibleRecords: purgeSummary.eligibleRecords,
            totalAmount: purgeSummary.totalAmount,
          }
        : null,
      onOpenChange: handlePurgeDialogOpenChange,
      onPasswordInputChange: setPurgePasswordInput,
      onConfirm: () => void handleConfirmPurgeOldRecords(),
    },
    viewAll: {
      open: viewAllOpen,
      loading: viewAllLoading,
      fromDate,
      toDate,
      records: viewAllRecords,
      summary: {
        totalRecords: viewAllTotalRecords,
        totalAmount: viewAllTotalAmount,
      },
      page: viewAllPage,
      pageSize: viewAllPageSize,
      totalPages: viewAllTotalPages,
      onOpenChange: (open: boolean) => {
        if (!open) {
          closeViewAll();
        } else {
          setViewAllOpen(true);
        }
      },
      onPageChange: setViewAllPage,
      onPageSizeChange: (nextPageSize: number) => {
        setViewAllPageSize(nextPageSize);
        setViewAllPage(1);
      },
      onViewReceipt: (record: CollectionRecord) => void handleViewReceipt(record),
    },
  };
}
