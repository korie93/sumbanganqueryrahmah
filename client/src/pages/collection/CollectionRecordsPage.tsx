import { memo, type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit3, Eye, FileText, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
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
import {
  COLLECTION_BATCH_OPTIONS,
  computeSummary,
  formatAmountRM,
  isPositiveAmount,
  isValidCustomerPhone,
  isValidDate,
  parseApiError,
  toReceiptPayload,
  validateReceiptFile,
} from "./utils";

type CollectionRecordsPageProps = {
  role: string;
};

function fitText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

type ReceiptPreviewKind = "pdf" | "image" | "unsupported";

function inferReceiptMimeTypeFromName(fileName: string): string {
  const normalized = String(fileName || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function resolveReceiptPreviewKind(input: {
  mimeType?: string;
  fileName?: string;
  receiptPath?: string;
}): ReceiptPreviewKind {
  const mimeType = String(input.mimeType || "").toLowerCase();
  const fileName = String(input.fileName || "");
  const receiptPath = String(input.receiptPath || "");
  const inferredMime = inferReceiptMimeTypeFromName(fileName) || inferReceiptMimeTypeFromName(receiptPath);
  const effectiveMime = mimeType || inferredMime;

  if (effectiveMime.includes("pdf")) return "pdf";
  if (effectiveMime.startsWith("image/")) return "image";
  return "unsupported";
}

function CollectionRecordsPage({ role }: CollectionRecordsPageProps) {
  const { toast } = useToast();
  const editReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const recordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
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

  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<CollectionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [viewAllLoading, setViewAllLoading] = useState(false);
  const [viewAllRecords, setViewAllRecords] = useState<CollectionRecord[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receiptPreviewRecord, setReceiptPreviewRecord] = useState<CollectionRecord | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewDownloading, setReceiptPreviewDownloading] = useState(false);
  const [receiptPreviewSource, setReceiptPreviewSource] = useState("");
  const [receiptPreviewMimeType, setReceiptPreviewMimeType] = useState("");
  const [receiptPreviewFileName, setReceiptPreviewFileName] = useState("");
  const [receiptPreviewError, setReceiptPreviewError] = useState("");
  const receiptPreviewKind = useMemo(
    () => resolveReceiptPreviewKind({
      mimeType: receiptPreviewMimeType,
      fileName: receiptPreviewFileName,
      receiptPath: receiptPreviewRecord?.receiptFile || "",
    }),
    [receiptPreviewFileName, receiptPreviewMimeType, receiptPreviewRecord?.receiptFile],
  );

  const visibleRecords = records;
  const summary = useMemo(() => computeSummary(records), [records]);
  const viewAllSummary = useMemo(() => computeSummary(viewAllRecords), [viewAllRecords]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleRecords.length / tablePageSize)), [visibleRecords.length, tablePageSize]);
  const paginatedRecords = useMemo(() => {
    const start = (tablePage - 1) * tablePageSize;
    return visibleRecords.slice(start, start + tablePageSize);
  }, [visibleRecords, tablePage, tablePageSize]);
  const pagedStart = visibleRecords.length === 0 ? 0 : (tablePage - 1) * tablePageSize + 1;
  const pagedEnd = Math.min(visibleRecords.length, tablePage * tablePageSize);

  const clearReceiptPreviewObjectUrl = useCallback(() => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReceiptPreviewObjectUrl();
      isMountedRef.current = false;
    };
  }, [clearReceiptPreviewObjectUrl]);

  useEffect(() => {
    setTablePage(1);
  }, [fromDate, toDate, searchInput, nicknameFilter, tablePageSize]);

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
      if (nicknameFilter !== "all" && !options.some((item) => item.nickname === nicknameFilter)) {
        setNicknameFilter("all");
      }
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
  }, [nicknameFilter, toast]);

  const loadRecords = useCallback(async (filters?: { from?: string; to?: string; search?: string; nickname?: string }) => {
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
  }, [toast]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  useEffect(() => {
    const trimmedSearch = searchInput.trim();
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
      void loadRecords({
        from: fromDate || undefined,
        to: toDate || undefined,
        search: trimmedSearch || undefined,
        nickname: canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : undefined,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, fromDate, toDate, loadRecords, canUseNicknameFilter, nicknameFilter]);

  const handleFilter = async () => {
    if (fromDate && !isValidDate(fromDate)) {
      toast({ title: "Validation Error", description: "From Date is invalid.", variant: "destructive" });
      return;
    }
    if (toDate && !isValidDate(toDate)) {
      toast({ title: "Validation Error", description: "To Date is invalid.", variant: "destructive" });
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      toast({ title: "Validation Error", description: "From Date cannot be later than To Date.", variant: "destructive" });
      return;
    }
    await loadRecords({
      from: fromDate || undefined,
      to: toDate || undefined,
      search: searchInput.trim() || undefined,
      nickname: canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : undefined,
    });
  };

  const handleResetFilter = async () => {
    skipNextAutoFetchRef.current = true;
    setFromDate("");
    setToDate("");
    setSearchInput("");
    setNicknameFilter("all");
    await loadRecords();
  };

  const toDisplayDate = (value: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleOpenViewAll = async () => {
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
      const response = await getCollectionRecords({
        from: fromDate,
        to: toDate,
      });
      setViewAllRecords(Array.isArray(response?.records) ? response.records : []);
      setViewAllOpen(true);
    } catch (error: unknown) {
      toast({
        title: "Failed to Load Full Listing",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setViewAllLoading(false);
    }
  };

  const closeReceiptPreview = useCallback(() => {
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

  const handleReceiptPreviewOpenChange = useCallback((open: boolean) => {
    if (open) {
      setReceiptPreviewOpen(true);
      return;
    }
    closeReceiptPreview();
  }, [closeReceiptPreview]);

  const handleViewReceipt = useCallback(async (record: CollectionRecord) => {
    if (!record.receiptFile) return;

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
      const { blob, mimeType, fileName } = await fetchCollectionReceiptBlob(record.id, "view");
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
      if (!isMountedRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      receiptPreviewUrlRef.current = objectUrl;
      setReceiptPreviewSource(objectUrl);
      setReceiptPreviewMimeType(normalizedMimeType || previewBlob.type || "");
      setReceiptPreviewFileName(normalizedFileName);
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      const message = parseApiError(error);
      const expectedKind = resolveReceiptPreviewKind({
        fileName: record.receiptFile || "",
        receiptPath: record.receiptFile || "",
      });
      if (expectedKind === "pdf") {
        setReceiptPreviewError("PDF preview is unavailable. You can still download the file.");
      } else if (message.toLowerCase().includes("preview not available")) {
        setReceiptPreviewError("Preview not available for this file type.");
      } else {
        setReceiptPreviewError(message);
      }
    } finally {
      if (!isMountedRef.current) return;
      setReceiptPreviewLoading(false);
    }
  }, [clearReceiptPreviewObjectUrl]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!receiptPreviewRecord || receiptPreviewDownloading) return;

    setReceiptPreviewDownloading(true);
    try {
      const { blob, fileName } = await fetchCollectionReceiptBlob(receiptPreviewRecord.id, "download");
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName || receiptPreviewFileName || `receipt-${receiptPreviewRecord.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
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

  const openEditDialog = (record: CollectionRecord) => {
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
  };

  const handleEditReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setEditReceiptFile(null);
      return;
    }
    const error = validateReceiptFile(file);
    if (error) {
      toast({ title: "Validation Error", description: error, variant: "destructive" });
      event.target.value = "";
      return;
    }
    setEditReceiptFile(file);
  };

  const handleClearEditReceipt = () => {
    setEditReceiptFile(null);
    if (editReceiptInputRef.current) editReceiptInputRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editingRecord || savingEdit) return;

    if (!editCustomerName.trim()) {
      toast({ title: "Validation Error", description: "Customer Name is required.", variant: "destructive" });
      return;
    }
    if (!editIcNumber.trim()) {
      toast({ title: "Validation Error", description: "IC Number is required.", variant: "destructive" });
      return;
    }
    if (!isValidCustomerPhone(editCustomerPhone)) {
      toast({ title: "Validation Error", description: "Customer Phone Number is invalid.", variant: "destructive" });
      return;
    }
    if (!editAccountNumber.trim()) {
      toast({ title: "Validation Error", description: "Account Number is required.", variant: "destructive" });
      return;
    }
    if (!COLLECTION_BATCH_OPTIONS.includes(editBatch)) {
      toast({ title: "Validation Error", description: "Batch is not valid.", variant: "destructive" });
      return;
    }
    if (!isValidDate(editPaymentDate)) {
      toast({ title: "Validation Error", description: "Payment Date is invalid.", variant: "destructive" });
      return;
    }
    if (!isPositiveAmount(editAmount)) {
      toast({ title: "Validation Error", description: "Amount must be greater than 0.", variant: "destructive" });
      return;
    }
    const normalizedEditNickname = editStaffNickname.trim();
    const staffNicknameChanged = normalizedEditNickname !== editingRecord.collectionStaffNickname;
    if (staffNicknameChanged) {
      const isOfficialNickname = nicknameOptions.some((item) => item.nickname === normalizedEditNickname && item.isActive);
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
      const payload: any = {
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
      if (!editRemoveReceipt && editReceiptFile) payload.receipt = await toReceiptPayload(editReceiptFile);

      await updateCollectionRecord(editingRecord.id, payload);
      toast({ title: "Record Updated", description: "Rekod collection berjaya dikemaskini." });
      setEditOpen(false);
      setEditingRecord(null);
      await loadRecords({
        from: fromDate || undefined,
        to: toDate || undefined,
        search: searchInput.trim() || undefined,
        nickname: canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : undefined,
      });
    } catch (error: unknown) {
      toast({ title: "Failed to Update Record", description: parseApiError(error), variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const canDeleteRow = (_record: CollectionRecord): boolean => canDeleteGlobal;

  const handleConfirmDelete = async () => {
    if (!pendingDeleteRecord || deletingId) return;
    setDeletingId(pendingDeleteRecord.id);
    try {
      await deleteCollectionRecord(pendingDeleteRecord.id);
      toast({ title: "Record Deleted", description: "Rekod collection berjaya dipadam." });
      setPendingDeleteRecord(null);
      await loadRecords({
        from: fromDate || undefined,
        to: toDate || undefined,
        search: searchInput.trim() || undefined,
        nickname: canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : undefined,
      });
    } catch (error: unknown) {
      toast({ title: "Failed to Delete Record", description: parseApiError(error), variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportExcel = async () => {
    if (visibleRecords.length === 0 || exportingExcel) {
      toast({ title: "Tiada Data", description: "Tiada rekod untuk diexport.", variant: "destructive" });
      return;
    }

    setExportingExcel(true);
    try {
      const XLSX = await import("xlsx");
      const reportRows = visibleRecords.map((record) => ([
        record.customerName,
        record.icNumber,
        record.accountNumber,
        record.customerPhone,
        Number(record.amount),
        record.paymentDate,
        record.receiptFile ? "Available" : "-",
        record.collectionStaffNickname,
      ]));

      const sheetData: any[][] = [
        ["Collection Report"],
        ["Generated Date", new Date().toLocaleString()],
        ["Date Range", `${fromDate || "All"} - ${toDate || "All"}`],
        ["Total Records", summary.totalRecords],
        ["Total Amount", summary.totalAmount],
        [],
        ["Customer Name", "IC Number", "Account Number", "Customer Phone Number", "Amount", "Payment Date", "Receipt", "Staff Nickname"],
        ...reportRows,
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const maxColumnLength = (columnIndex: number) => {
        return Math.max(
          ...sheetData.map((row) => String(row[columnIndex] ?? "").length),
          12,
        );
      };
      worksheet["!cols"] = Array.from({ length: 8 }).map((_, idx) => ({ wch: Math.min(38, maxColumnLength(idx) + 2) }));

      if (worksheet["A1"]) {
        worksheet["A1"].s = { font: { bold: true, sz: 16 } };
      }
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        const headerCell = `${col}7`;
        if (worksheet[headerCell]) {
          worksheet[headerCell].s = { font: { bold: true } };
        }
      }

      const totalAmountCell = "B5";
      if (worksheet[totalAmountCell]) {
        worksheet[totalAmountCell].z = "\"RM\" #,##0.00";
      }
      for (let row = 8; row < 8 + reportRows.length; row += 1) {
        const amountCell = `E${row}`;
        if (worksheet[amountCell]) worksheet[amountCell].z = "\"RM\" #,##0.00";
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Collection Report");
      XLSX.writeFile(workbook, `Collection-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error: unknown) {
      toast({ title: "Export Failed", description: parseApiError(error), variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (visibleRecords.length === 0 || exportingPdf) {
      toast({ title: "Tiada Data", description: "Tiada rekod untuk diexport.", variant: "destructive" });
      return;
    }

    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const margin = 10;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const rowHeight = 7;
      const headers = ["Customer", "IC", "Account", "Phone", "Amount", "Pay Date", "Receipt", "Staff"];
      const colWidths = [46, 28, 36, 30, 22, 23, 17, 42];
      let y = 12;
      let pageNo = 1;

      const drawHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text("Collection Report", margin, y);
        y += 7;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text(`Generated Date: ${new Date().toLocaleString()}`, margin, y);
        y += 5;
        const staffLabel = canUseNicknameFilter && nicknameFilter !== "all" ? nicknameFilter : "All";
        pdf.text(`Staff: ${staffLabel}`, margin, y);
        y += 5;
        pdf.text(`Date Range: ${fromDate || "All"} - ${toDate || "All"}`, margin, y);
        y += 6;

        pdf.setFillColor(235, 240, 248);
        pdf.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        let x = margin;
        headers.forEach((header, i) => {
          pdf.text(header, x + 1.5, y + 4.5);
          x += colWidths[i];
        });
        y += rowHeight;
      };

      const drawFooter = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(`Total Records: ${summary.totalRecords}`, margin, pageHeight - 8);
        pdf.text(`Total Amount: ${formatAmountRM(summary.totalAmount)}`, margin + 70, pageHeight - 8);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${pageNo}`, pageWidth - margin - 14, pageHeight - 8);
      };

      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);

      for (const record of visibleRecords) {
        if (y + rowHeight > pageHeight - 14) {
          drawFooter();
          pdf.addPage();
          pageNo += 1;
          y = 12;
          drawHeader();
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
        }

        const row = [
          fitText(record.customerName, 22),
          fitText(record.icNumber, 16),
          fitText(record.accountNumber, 18),
          fitText(record.customerPhone, 15),
          fitText(formatAmountRM(record.amount), 12),
          fitText(record.paymentDate, 10),
          record.receiptFile ? "Yes" : "-",
          fitText(record.collectionStaffNickname, 18),
        ];

        let x = margin;
        row.forEach((text, i) => {
          pdf.rect(x, y, colWidths[i], rowHeight);
          pdf.text(text, x + 1.5, y + 4.5);
          x += colWidths[i];
        });
        y += rowHeight;
      }

      drawFooter();
      pdf.save(`Collection-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error: unknown) {
      toast({ title: "Export Failed", description: parseApiError(error), variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">View Rekod Collection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`grid gap-3 ${canUseNicknameFilter ? "xl:grid-cols-[170px_170px_minmax(260px,1fr)_220px_auto_auto]" : "xl:grid-cols-[170px_170px_minmax(260px,1fr)_auto_auto]"}`}>
            <div className="space-y-1">
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Search</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari nama / IC / akaun / telefon / jumlah bayaran"
                  className="pl-9"
                />
              </div>
            </div>
            {canUseNicknameFilter && (
              <div className="space-y-1">
                <Label>Staff Nickname (optional)</Label>
                <Select value={nicknameFilter} onValueChange={setNicknameFilter} disabled={loadingNicknames}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua staff</SelectItem>
                    {nicknameOptions
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.nickname}>
                          {item.nickname}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-end">
              <Button variant="outline" onClick={handleFilter} disabled={loadingRecords}>Filter</Button>
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={handleResetFilter} disabled={loadingRecords}>Reset</Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-border/60 bg-background/60">
              <CardContent className="px-3 py-2">
                <p className="text-xs text-muted-foreground">Total Records</p>
                <p className="text-lg font-semibold leading-tight">{summary.totalRecords}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-background/60">
              <CardContent className="px-3 py-2">
                <p className="text-xs text-muted-foreground">Total Collection Amount</p>
                <p className="text-lg font-semibold leading-tight">{formatAmountRM(summary.totalAmount)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleOpenViewAll} disabled={loadingRecords || viewAllLoading}>
              {viewAllLoading ? "Loading..." : "View All"}
            </Button>
            <Button variant="outline" onClick={handleExportExcel} disabled={loadingRecords || exportingExcel}>
              <Download className="w-4 h-4 mr-2" />
              {exportingExcel ? "Exporting..." : "Export Excel"}
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={loadingRecords || exportingPdf}>
              <FileText className="w-4 h-4 mr-2" />
              {exportingPdf ? "Exporting..." : "Export PDF"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {pagedStart}-{pagedEnd} of {visibleRecords.length} records
            </p>
            <div className="flex items-center gap-2">
              <Select value={String(tablePageSize)} onValueChange={(value) => setTablePageSize(Number(value))}>
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {tablePage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={tablePage >= totalPages}
                onClick={() => setTablePage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border/60 min-h-[420px] max-h-[64vh] overflow-auto">
            <Table className="min-w-[1140px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-background z-10">Customer Name</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">IC Number</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Account Number</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Customer Phone Number</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Amount</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Payment Date</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Receipt</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Staff Nickname</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRecords ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">Loading records...</TableCell>
                  </TableRow>
                ) : visibleRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">No collection records found.</TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="py-1.5">{record.customerName}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{record.icNumber}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{record.accountNumber}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{record.customerPhone}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{formatAmountRM(record.amount)}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{record.paymentDate}</TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">
                        {record.receiptFile ? (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto px-0 text-primary"
                            onClick={() => {
                              void handleViewReceipt(record);
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 whitespace-nowrap">{record.collectionStaffNickname}</TableCell>
                      <TableCell className="py-1.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {canEdit && (
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(record)}>
                              <Edit3 className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                          )}
                          {canDeleteRow(record) && (
                            <Button size="sm" variant="destructive" onClick={() => setPendingDeleteRecord(record)}>
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={receiptPreviewOpen} onOpenChange={handleReceiptPreviewOpenChange}>
        <DialogContent className="w-[95vw] max-w-5xl h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>
              {receiptPreviewFileName || receiptPreviewRecord?.receiptFile || "Preview fail resit yang dimuat naik."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 rounded-md border border-border/60 bg-background/40 overflow-auto p-3">
            {receiptPreviewLoading ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                Loading preview...
              </div>
            ) : receiptPreviewError ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                {receiptPreviewError}
              </div>
            ) : !receiptPreviewSource ? (
              <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                {receiptPreviewKind === "pdf"
                  ? "PDF preview is unavailable. You can still download the file."
                  : "Preview not available for this file type."}
              </div>
            ) : receiptPreviewKind === "pdf" ? (
              <iframe
                src={receiptPreviewSource}
                title="Receipt PDF Preview"
                className="w-full h-full min-h-[65vh] rounded-sm bg-white"
              />
            ) : receiptPreviewKind === "image" ? (
              <div className="h-full flex items-center justify-center">
                <img
                  src={receiptPreviewSource}
                  alt={receiptPreviewFileName || "Receipt preview"}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            ) : (
              <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                Preview not available for this file type.
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void handleDownloadReceipt();
              }}
              disabled={!receiptPreviewRecord || receiptPreviewDownloading}
            >
              <Download className="w-4 h-4 mr-2" />
              {receiptPreviewDownloading ? "Downloading..." : "Download"}
            </Button>
            <Button type="button" variant="secondary" onClick={closeReceiptPreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Collection Record</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>IC Number</Label>
              <Input value={editIcNumber} onChange={(e) => setEditIcNumber(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>Customer Phone Number</Label>
              <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input value={editAccountNumber} onChange={(e) => setEditAccountNumber(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select value={editBatch} onValueChange={(value) => setEditBatch(value as CollectionBatch)} disabled={savingEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLLECTION_BATCH_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" value={editPaymentDate} onChange={(e) => setEditPaymentDate(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>Amount (RM)</Label>
              <Input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} disabled={savingEdit} />
            </div>
            <div className="space-y-2">
              <Label>Staff Nickname</Label>
              <Select value={editStaffNickname} onValueChange={setEditStaffNickname} disabled={savingEdit || loadingNicknames}>
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
                  {editStaffNickname && !nicknameOptions.some((item) => item.nickname === editStaffNickname && item.isActive) && (
                    <SelectItem value={editStaffNickname}>
                      {editStaffNickname} (inactive)
                    </SelectItem>
                  )}
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
                onChange={handleEditReceiptChange}
                disabled={savingEdit || editRemoveReceipt}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => editReceiptInputRef.current?.click()} disabled={savingEdit || editRemoveReceipt}>
                  Upload Resit Bayaran
                </Button>
                <Button type="button" variant="ghost" onClick={handleClearEditReceipt} disabled={savingEdit || !editReceiptFile}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear
                </Button>
                {editingRecord?.receiptFile && (
                  <Button type="button" size="sm" variant={editRemoveReceipt ? "secondary" : "outline"} onClick={() => setEditRemoveReceipt((prev) => !prev)} disabled={savingEdit}>
                    {editRemoveReceipt ? "Receipt will be removed" : "Remove existing receipt"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Sila upload resit bayaran daripada customer (optional). Format: JPG, PNG, PDF
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteRecord)} onOpenChange={(open) => !open && setPendingDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Rekod</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu padam rekod collection ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deletingId !== null}>
              {deletingId ? "Memadam..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
        <DialogContent className="w-[96vw] max-w-[96vw] h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="px-6 py-4 border-b bg-background/95">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Senarai Penuh Rekod Collection</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dari {toDisplayDate(fromDate)} hingga {toDisplayDate(toDate)}
                  </p>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Total Records: <span className="font-medium text-foreground">{viewAllSummary.totalRecords}</span>
                    {" · "}
                    Total Collection: <span className="font-medium text-foreground">{formatAmountRM(viewAllSummary.totalAmount)}</span>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setViewAllOpen(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 p-4">
              <div className="h-full rounded-md border border-border/60 overflow-auto">
                <Table className="text-sm min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-background z-10">Customer Name</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">IC Number</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Account Number</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Customer Phone Number</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Amount</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Payment Date</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Receipt</TableHead>
                      <TableHead className="sticky top-0 bg-background z-10">Staff Nickname</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewAllRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                          Tiada rekod dalam julat tarikh yang dipilih.
                        </TableCell>
                      </TableRow>
                    ) : (
                      viewAllRecords.map((record) => (
                        <TableRow key={`view-all-${record.id}`}>
                          <TableCell className="py-2">{record.customerName}</TableCell>
                          <TableCell className="py-2">{record.icNumber}</TableCell>
                          <TableCell className="py-2">{record.accountNumber}</TableCell>
                          <TableCell className="py-2">{record.customerPhone}</TableCell>
                          <TableCell className="py-2">{formatAmountRM(record.amount)}</TableCell>
                          <TableCell className="py-2">{record.paymentDate}</TableCell>
                          <TableCell className="py-2">
                            {record.receiptFile ? (
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto px-0 text-primary"
                                onClick={() => {
                                  void handleViewReceipt(record);
                                }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">{record.collectionStaffNickname}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
