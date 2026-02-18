import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, RefreshCw, User, Clock, Info, Search, Filter, Calendar, X, ChevronDown, Download, Trash2, AlertTriangle, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import jsPDF from "jspdf";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAuditLogs, getAuditLogStats, cleanupAuditLogs } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AuditLogRecord {
  id: string;
  action: string;
  performedBy: string;
  targetUser?: string;
  targetResource?: string;
  details?: string;
  timestamp: string;
}

const actionLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  KICK_USER: { label: "Force Logout", variant: "secondary" },
  KICK_USER_FAILED: { label: "Force Logout Failed", variant: "outline" },
  BAN_USER: { label: "Ban User", variant: "destructive" },
  BAN_USER_FAILED: { label: "Ban Failed", variant: "outline" },
  UNBAN_USER: { label: "Unban User", variant: "default" },
  IMPORT_DATA: { label: "Import Data", variant: "default" },
  DELETE_IMPORT: { label: "Delete Import", variant: "destructive" },
  DELETE_IMPORT_FAILED: { label: "Delete Import Failed", variant: "outline" },
  CREATE_BACKUP: { label: "Create Backup", variant: "default" },
  RESTORE_BACKUP: { label: "Restore Backup", variant: "secondary" },
  RESTORE_BACKUP_FAILED: { label: "Restore Failed", variant: "outline" },
  DELETE_BACKUP: { label: "Delete Backup", variant: "destructive" },
  DELETE_BACKUP_FAILED: { label: "Delete Backup Failed", variant: "outline" },
  CLEANUP_AUDIT_LOGS: { label: "Cleanup Logs", variant: "destructive" },
  RENAME_IMPORT: { label: "Rename Import", variant: "secondary" },
};

interface AuditLogStats {
  total: number;
  olderThan30Days: number;
  olderThan60Days: number;
  olderThan90Days: number;
  oldestLogDate: string | null;
}

const actionOptions = [
  { value: "all", label: "All Actions" },
  { value: "KICK_USER", label: "Force Logout" },
  { value: "KICK_USER_FAILED", label: "Force Logout Failed" },
  { value: "BAN_USER", label: "Ban User" },
  { value: "BAN_USER_FAILED", label: "Ban Failed" },
  { value: "UNBAN_USER", label: "Unban User" },
  { value: "IMPORT_DATA", label: "Import Data" },
  { value: "DELETE_IMPORT", label: "Delete Import" },
  { value: "DELETE_IMPORT_FAILED", label: "Delete Import Failed" },
  { value: "CREATE_BACKUP", label: "Create Backup" },
  { value: "RESTORE_BACKUP", label: "Restore Backup" },
  { value: "RESTORE_BACKUP_FAILED", label: "Restore Failed" },
  { value: "DELETE_BACKUP", label: "Delete Backup" },
  { value: "DELETE_BACKUP_FAILED", label: "Delete Backup Failed" },
  { value: "CLEANUP_AUDIT_LOGS", label: "Cleanup Logs" },
  { value: "RENAME_IMPORT", label: "Rename Import" },
];

const datePresets = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(true);
  const [cleanupOpen, setCleanupOpen] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [performedByFilter, setPerformedByFilter] = useState("");
  const [targetUserFilter, setTargetUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [stats, setStats] = useState<AuditLogStats | null>(null);
  const [cleanupDays, setCleanupDays] = useState("30");
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAuditLogs();
      setLogs(response.logs || []);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await getAuditLogStats();
      setStats(response);
    } catch (err) {
      console.error("Failed to fetch audit log stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleCleanup = async () => {
    const days = parseInt(cleanupDays);
    if (isNaN(days) || days < 1) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number of days.",
        variant: "destructive",
      });
      return;
    }

    setCleanupLoading(true);
    try {
      const response = await cleanupAuditLogs(days);
      toast({
        title: "Cleanup Complete",
        description: `Deleted ${response.deletedCount} audit log entries older than ${days} days.`,
      });
      setCleanupDialogOpen(false);
      fetchLogs();
      fetchStats();
    } catch (err: any) {
      toast({
        title: "Cleanup Failed",
        description: err.message || "Failed to cleanup audit logs.",
        variant: "destructive",
      });
    } finally {
      setCleanupLoading(false);
    }
  };

  const getLogsToDeleteCount = () => {
    if (!stats) return 0;
    const days = parseInt(cleanupDays);
    if (days <= 30) return stats.olderThan30Days;
    if (days <= 60) return stats.olderThan60Days;
    if (days <= 90) return stats.olderThan90Days;
    return stats.olderThan90Days;
  };

  const getDateRange = useCallback((preset: string): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case "today":
        return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
      case "yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return { from: yesterday, to: new Date(today.getTime() - 1) };
      }
      case "week": {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from: weekAgo, to: now };
      }
      case "month": {
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { from: monthAgo, to: now };
      }
      case "quarter": {
        const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        return { from: quarterAgo, to: now };
      }
      case "year": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return { from: startOfYear, to: now };
      }
      case "custom":
        return {
          from: dateFrom ? new Date(dateFrom) : null,
          to: dateTo ? new Date(dateTo + "T23:59:59") : null,
        };
      default:
        return { from: null, to: null };
    }
  }, [dateFrom, dateTo]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) {
        return false;
      }

      if (performedByFilter && !log.performedBy.toLowerCase().includes(performedByFilter.toLowerCase())) {
        return false;
      }

      if (targetUserFilter && (!log.targetUser || !log.targetUser.toLowerCase().includes(targetUserFilter.toLowerCase()))) {
        return false;
      }

      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const matchesDetails = log.details?.toLowerCase().includes(searchLower);
        const matchesResource = log.targetResource?.toLowerCase().includes(searchLower);
        const matchesAction = actionLabels[log.action]?.label.toLowerCase().includes(searchLower);
        if (!matchesDetails && !matchesResource && !matchesAction) {
          return false;
        }
      }

      if (datePreset !== "all") {
        const { from, to } = getDateRange(datePreset);
        const logDate = new Date(log.timestamp);
        if (from && logDate < from) return false;
        if (to && logDate > to) return false;
      }

      return true;
    });
  }, [logs, actionFilter, performedByFilter, targetUserFilter, searchText, datePreset, getDateRange]);

  const clearAllFilters = () => {
    setSearchText("");
    setPerformedByFilter("");
    setTargetUserFilter("");
    setActionFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = searchText || performedByFilter || targetUserFilter || actionFilter !== "all" || datePreset !== "all";

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const escapeCSV = (value: string) => `"${(value || "").replace(/"/g, '""')}"`;
    
    const headers = ["Action", "Performed By", "Target User", "Resource", "Details", "Timestamp"];
    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...filteredLogs.map((log) =>
        [
          escapeCSV(actionLabels[log.action]?.label || log.action),
          escapeCSV(log.performedBy),
          escapeCSV(log.targetUser || ""),
          escapeCSV(log.targetResource || ""),
          escapeCSV(log.details || ""),
          escapeCSV(formatTime(log.timestamp)),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SQR-audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const exportToPDF = async () => {
    if (filteredLogs.length === 0) return;

    setExportingPdf(true);
    try {
      const isDark = document.documentElement.classList.contains("dark");
      
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let yPos = margin;

      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");

      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      pdf.text("Audit Logs Report", margin, yPos + 6);
      yPos += 12;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(isDark ? 180 : 100);
      pdf.text(`${filteredLogs.length} records | Generated: ${new Date().toLocaleString()}`, margin, yPos);
      yPos += 8;

      pdf.setDrawColor(isDark ? 100 : 200);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      const headers = ["Action", "Performed By", "Target User", "Resource", "Details", "Timestamp"];
      const colWidths = [35, 30, 30, 40, 70, 45];
      const rowHeight = 7;
      const maxRowsPerPage = Math.floor((pageHeight - yPos - 20) / rowHeight);

      pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
      pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      let xPos = margin;
      headers.forEach((header, i) => {
        pdf.text(header, xPos + 2, yPos + 5);
        xPos += colWidths[i];
      });
      yPos += rowHeight;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      let rowsOnPage = 0;
      let pageNum = 1;

      filteredLogs.forEach((log, rowIndex) => {
        if (rowsOnPage >= maxRowsPerPage - 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(isDark ? 120 : 150);
          pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
          pdf.text("SQR System - Audit Logs", margin, pageHeight - 8);
          
          pdf.addPage();
          pageNum++;
          yPos = margin;
          rowsOnPage = 0;

          pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");

          pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
          pdf.setFontSize(8);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(isDark ? 255 : 30);
          xPos = margin;
          headers.forEach((header, i) => {
            pdf.text(header, xPos + 2, yPos + 5);
            xPos += colWidths[i];
          });
          yPos += rowHeight;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
        }

        if (rowIndex % 2 === 0) {
          pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
          pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
        }

        pdf.setTextColor(isDark ? 220 : 50);
        xPos = margin;
        const rowData = [
          actionLabels[log.action]?.label || log.action,
          log.performedBy,
          log.targetUser || "-",
          log.targetResource || "-",
          log.details || "-",
          formatTime(log.timestamp),
        ];
        rowData.forEach((cell, i) => {
          const maxChars = Math.floor(colWidths[i] / 2);
          const text = cell.length > maxChars ? cell.substring(0, maxChars - 2) + ".." : cell;
          pdf.text(text, xPos + 2, yPos + 5);
          xPos += colWidths[i];
        });
        yPos += rowHeight;
        rowsOnPage++;
      });

      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System - Audit Logs", margin, pageHeight - 8);

      pdf.save(`SQR-audit-logs-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error: any) {
      console.error("Failed to export PDF:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export PDF",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getActionBadge = (action: string) => {
    const actionInfo = actionLabels[action] || { label: action, variant: "outline" as const };
    return <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-audit-logs-title">
              Audit Logs
            </h1>
            <p className="text-sm text-muted-foreground">
              Records of all administrator actions in the system
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={loading || filteredLogs.length === 0 || exportingPdf}
                data-testid="button-export-logs"
              >
                {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" align="end">
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={exportToCSV}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={exportToPDF}
                  disabled={exportingPdf}
                  data-testid="button-export-pdf"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            onClick={fetchLogs}
            disabled={loading}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="p-0 h-auto gap-2">
                  <Filter className="h-5 w-5" />
                  <CardTitle className="text-lg">Search & Filters</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-muted-foreground"
                  data-testid="button-clear-filters"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search-text" className="text-sm font-medium flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    Search Text
                  </Label>
                  <Input
                    id="search-text"
                    placeholder="Search in details, resources..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    data-testid="input-search-text"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="performed-by" className="text-sm font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Performed By
                  </Label>
                  <Input
                    id="performed-by"
                    placeholder="Username..."
                    value={performedByFilter}
                    onChange={(e) => setPerformedByFilter(e.target.value)}
                    data-testid="input-performed-by"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-user" className="text-sm font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Target User
                  </Label>
                  <Input
                    id="target-user"
                    placeholder="Target username..."
                    value={targetUserFilter}
                    onChange={(e) => setTargetUserFilter(e.target.value)}
                    data-testid="input-target-user"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    Action Type
                  </Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger data-testid="select-action-type">
                      <SelectValue placeholder="Select action type" />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Time Period
                  </Label>
                  <Select value={datePreset} onValueChange={(value) => {
                    setDatePreset(value);
                    if (value !== "custom") {
                      setDateFrom("");
                      setDateTo("");
                    }
                  }}>
                    <SelectTrigger data-testid="select-date-preset">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      {datePresets.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {datePreset === "custom" && (
                  <div className="space-y-2 lg:col-span-1">
                    <Label className="text-sm font-medium">Custom Date Range</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="flex-1"
                        data-testid="input-date-from"
                      />
                      <span className="text-muted-foreground text-sm">-</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="flex-1"
                        data-testid="input-date-to"
                      />
                    </div>
                  </div>
                )}
              </div>

              {hasActiveFilters && (
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Active filters:</span>
                  {actionFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1">
                      Action: {actionOptions.find(o => o.value === actionFilter)?.label}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setActionFilter("all")}
                        data-testid="button-clear-action-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {performedByFilter && (
                    <Badge variant="secondary" className="gap-1">
                      By: {performedByFilter}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setPerformedByFilter("")}
                        data-testid="button-clear-performed-by-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {targetUserFilter && (
                    <Badge variant="secondary" className="gap-1">
                      Target: {targetUserFilter}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setTargetUserFilter("")}
                        data-testid="button-clear-target-user-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {searchText && (
                    <Badge variant="secondary" className="gap-1">
                      Text: {searchText}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => setSearchText("")}
                        data-testid="button-clear-search-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                  {datePreset !== "all" && (
                    <Badge variant="secondary" className="gap-1">
                      Time: {datePreset === "custom" ? `${dateFrom || "?"} - ${dateTo || "?"}` : datePresets.find(p => p.value === datePreset)?.label}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => { setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
                        data-testid="button-clear-date-filter"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <Collapsible open={cleanupOpen} onOpenChange={setCleanupOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="p-0 h-auto gap-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle className="text-lg">Log Cleanup</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${cleanupOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Total Logs</p>
                  <p className="text-2xl font-bold" data-testid="text-total-logs">{stats?.total ?? logs.length}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Older than 30 Days</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-old-30-days">{stats?.olderThan30Days ?? 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-sm text-muted-foreground">Older than 90 Days</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-old-90-days">{stats?.olderThan90Days ?? 0}</p>
                </div>
              </div>

              {stats?.oldestLogDate && (
                <p className="text-sm text-muted-foreground">
                  Oldest log entry: {formatTime(stats.oldestLogDate)}
                </p>
              )}

              <div className="flex items-end gap-4 flex-wrap pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="cleanup-days" className="text-sm font-medium">
                    Delete logs older than (days)
                  </Label>
                  <Select value={cleanupDays} onValueChange={setCleanupDays}>
                    <SelectTrigger className="w-[180px]" data-testid="select-cleanup-days">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setCleanupDialogOpen(true)}
                  disabled={cleanupLoading || getLogsToDeleteCount() === 0}
                  data-testid="button-cleanup-logs"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup ({getLogsToDeleteCount()} logs)
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Cleanup
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all audit logs older than {cleanupDays} days.
              This action cannot be undone. Approximately {getLogsToDeleteCount()} log entries will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupLoading} data-testid="button-cancel-cleanup">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanup}
              disabled={cleanupLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cleanup"
            >
              {cleanupLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Logs
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Collapsible open={recordsOpen} onOpenChange={setRecordsOpen}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-records">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Activity Records ({filteredLogs.length} of {logs.length} entries)
                </CardTitle>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${recordsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {logs.length === 0 ? (
                    <p>No audit records found.</p>
                  ) : (
                    <>
                      <p>No records match the filters.</p>
                      <Button
                        variant="ghost"
                        onClick={clearAllFilters}
                        className="mt-2"
                        data-testid="button-clear-filters-empty"
                      >
                        Clear all filters
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 rounded-lg border bg-muted/30 space-y-2"
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          {getActionBadge(log.action)}
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span data-testid={`text-performed-by-${log.id}`}>
                              {log.performedBy}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span data-testid={`text-timestamp-${log.id}`}>
                            {formatTime(log.timestamp)}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm space-y-1">
                        {log.targetUser && (
                          <p>
                            <span className="text-muted-foreground">Target user:</span>{" "}
                            <span className="font-medium" data-testid={`text-target-user-${log.id}`}>
                              {log.targetUser}
                            </span>
                          </p>
                        )}
                        {log.targetResource && (
                          <p>
                            <span className="text-muted-foreground">Resource ID:</span>{" "}
                            <span className="font-mono text-xs" data-testid={`text-target-resource-${log.id}`}>
                              {log.targetResource}
                            </span>
                          </p>
                        )}
                        {log.details && (
                          <p
                            className="text-muted-foreground"
                            data-testid={`text-details-${log.id}`}
                          >
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
