import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionMonthlySummary,
  getCollectionNicknames,
  getCollectionRecords,
  type CollectionMonthlySummary,
  type CollectionRecord,
  type CollectionStaffNickname,
} from "@/lib/api";
import { formatAmountRM, parseApiError } from "./utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function buildEmptySummary(): CollectionMonthlySummary[] {
  return MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    totalRecords: 0,
    totalAmount: 0,
  }));
}

function normalizeSummaryRows(rows: CollectionMonthlySummary[] | undefined): CollectionMonthlySummary[] {
  if (!Array.isArray(rows) || rows.length === 0) return buildEmptySummary();

  const byMonth = new Map<number, CollectionMonthlySummary>();
  for (const row of rows) {
    const month = Number(row?.month || 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      month,
      monthName: String(row.monthName || MONTH_NAMES[month - 1]),
      totalRecords: Number(row.totalRecords || 0),
      totalAmount: Number(row.totalAmount || 0),
    });
  }

  return MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const found = byMonth.get(month);
    if (found) return found;
    return {
      month,
      monthName,
      totalRecords: 0,
      totalAmount: 0,
    };
  });
}

function normalizeNicknameSelection(values: string[]): string[] {
  const unique = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    result.push(normalized);
  }
  return result;
}

function toDisplayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function buildMonthRange(year: number, month: number): { from: string; to: string } {
  const safeMonth = Math.min(12, Math.max(1, month));
  const monthText = String(safeMonth).padStart(2, "0");
  const from = `${year}-${monthText}-01`;
  const lastDay = new Date(year, safeMonth, 0).getDate();
  const to = `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

type CollectionSummaryPageProps = {
  role: string;
};

function CollectionSummaryPage({ role }: CollectionSummaryPageProps) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const summaryRequestIdRef = useRef(0);
  const monthRecordsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const canFilterByNickname = role === "admin" || role === "superuser";
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear + 1; year >= currentYear - 5; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([]);
  const [nicknameDropdownOpen, setNicknameDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summaryRows, setSummaryRows] = useState<CollectionMonthlySummary[]>(() => buildEmptySummary());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [monthRecords, setMonthRecords] = useState<CollectionRecord[]>([]);
  const [loadingMonthRecords, setLoadingMonthRecords] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const visibleNicknameOptions = useMemo(() => {
    const byLower = new Map<string, CollectionStaffNickname>();
    for (const item of nicknameOptions) {
      const nickname = String(item.nickname || "").trim();
      if (!nickname) continue;
      const key = nickname.toLowerCase();
      if (!byLower.has(key)) {
        byLower.set(key, { ...item, nickname });
      }
    }
    return Array.from(byLower.values());
  }, [nicknameOptions]);

  const visibleNicknameValues = useMemo(
    () => visibleNicknameOptions.map((item) => item.nickname),
    [visibleNicknameOptions],
  );

  const loadNicknameOptions = useCallback(async () => {
    const requestId = ++nicknamesRequestIdRef.current;
    if (!canFilterByNickname) {
      setNicknameOptions([]);
      setSelectedNicknames([]);
      return;
    }
    try {
      const response = await getCollectionNicknames();
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const options = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(options);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    }
  }, [canFilterByNickname, toast]);

  const loadSummary = useCallback(async (year: number, nicknames?: string[]) => {
    const requestId = ++summaryRequestIdRef.current;
    setLoading(true);
    try {
      const response = await getCollectionMonthlySummary({ year, nicknames });
      if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
      setSummaryRows(normalizeSummaryRows(response?.summary));
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
      setSummaryRows(buildEmptySummary());
      toast({
        title: "Failed to Load Summary",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
      setLoading(false);
    }
  }, [toast]);

  const loadMonthRecords = useCallback(async (year: number, month: number, nicknames?: string[]) => {
    const requestId = ++monthRecordsRequestIdRef.current;
    setLoadingMonthRecords(true);
    try {
      const range = buildMonthRange(year, month);
      const normalizedFilters = Array.isArray(nicknames) && nicknames.length > 0
        ? Array.from(new Set(nicknames.map((value) => String(value || "").trim()).filter(Boolean)))
        : [];

      const response = await getCollectionRecords({
        from: range.from,
        to: range.to,
        nickname: normalizedFilters.length === 1 ? normalizedFilters[0] : undefined,
      });
      if (!isMountedRef.current || requestId !== monthRecordsRequestIdRef.current) return;
      const records = Array.isArray(response?.records) ? response.records : [];
      const normalizedFiltersSet = normalizedFilters.length > 1
        ? new Set(normalizedFilters.map((value) => value.toLowerCase()))
        : null;
      const filteredRecords = normalizedFiltersSet
        ? records.filter((item) => normalizedFiltersSet.has(String(item.collectionStaffNickname || "").trim().toLowerCase()))
        : records;
      setMonthRecords(filteredRecords);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== monthRecordsRequestIdRef.current) return;
      setMonthRecords([]);
      toast({
        title: "Failed to Load Monthly Records",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== monthRecordsRequestIdRef.current) return;
      setLoadingMonthRecords(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadNicknameOptions();
  }, [loadNicknameOptions]);

  useEffect(() => {
    if (!canFilterByNickname) return;
    const visibleSet = new Set(visibleNicknameValues.map((value) => value.toLowerCase()));
    setSelectedNicknames((prev) => {
      const next = normalizeNicknameSelection(prev).filter((value) => visibleSet.has(value.toLowerCase()));
      if (next.length === prev.length && next.every((value, index) => value === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [canFilterByNickname, visibleNicknameValues]);

  useEffect(() => {
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return;
    const nicknames = canFilterByNickname && selectedNicknames.length > 0
      ? selectedNicknames
      : undefined;
    void loadSummary(year, nicknames);
  }, [selectedYear, canFilterByNickname, selectedNicknames, loadSummary]);

  useEffect(() => {
    if (selectedMonth === null) {
      setMonthRecords([]);
      return;
    }
    const year = Number(selectedYear);
    if (!Number.isInteger(year) || selectedMonth < 1 || selectedMonth > 12) {
      setMonthRecords([]);
      return;
    }
    const nicknames = canFilterByNickname && selectedNicknames.length > 0
      ? selectedNicknames
      : undefined;
    void loadMonthRecords(year, selectedMonth, nicknames);
  }, [selectedYear, selectedMonth, canFilterByNickname, selectedNicknames, loadMonthRecords]);

  const grandTotal = useMemo(() => {
    return summaryRows.reduce(
      (acc, row) => {
        acc.totalRecords += Number(row.totalRecords) || 0;
        acc.totalAmount += Number(row.totalAmount) || 0;
        return acc;
      },
      { totalRecords: 0, totalAmount: 0 },
    );
  }, [summaryRows]);

  const selectedMonthSummary = useMemo(() => {
    if (selectedMonth === null) return null;
    return summaryRows.find((item) => item.month === selectedMonth) || null;
  }, [summaryRows, selectedMonth]);

  const selectedMonthRange = useMemo(() => {
    if (selectedMonth === null) return null;
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return null;
    const range = buildMonthRange(year, selectedMonth);
    return {
      from: range.from,
      to: range.to,
      label: `Dari ${toDisplayDate(range.from)} hingga ${toDisplayDate(range.to)}`,
    };
  }, [selectedYear, selectedMonth]);

  const monthRecordTotals = useMemo(() => {
    return monthRecords.reduce(
      (acc, row) => {
        acc.totalRecords += 1;
        const amount = Number(row.amount);
        acc.totalAmount += Number.isFinite(amount) ? amount : 0;
        return acc;
      },
      { totalRecords: 0, totalAmount: 0 },
    );
  }, [monthRecords]);

  const selectedNicknameSet = useMemo(
    () => new Set(selectedNicknames.map((value) => value.toLowerCase())),
    [selectedNicknames],
  );

  const allSelected = canFilterByNickname
    && visibleNicknameValues.length > 0
    && selectedNicknames.length === visibleNicknameValues.length;
  const partiallySelected = canFilterByNickname
    && selectedNicknames.length > 0
    && selectedNicknames.length < visibleNicknameValues.length;

  const toggleNickname = (nickname: string, checked: boolean) => {
    setSelectedNicknames((prev) => {
      if (checked) {
        return normalizeNicknameSelection([...prev, nickname]);
      }
      const target = nickname.toLowerCase();
      return prev.filter((value) => value.toLowerCase() !== target);
    });
  };

  const selectAllVisible = () => {
    setSelectedNicknames(normalizeNicknameSelection(visibleNicknameValues));
  };

  const clearAllSelected = () => {
    setSelectedNicknames([]);
  };

  const selectedNicknameLabel = selectedNicknames.length === 0
    ? "Semua staff"
    : `${selectedNicknames.length} nickname dipilih`;

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Collection Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`grid gap-3 ${canFilterByNickname ? "lg:grid-cols-[220px_minmax(0,1fr)]" : "lg:grid-cols-[220px]"}`}>
          <div className="space-y-1">
            <Label>Year</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canFilterByNickname && (
            <div className="space-y-1">
              <Label>Staff Nickname (optional)</Label>
              <Popover open={nicknameDropdownOpen} onOpenChange={setNicknameDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={loading}
                  >
                    <span className="truncate text-left">{selectedNicknameLabel}</span>
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[340px] p-2">
                  {visibleNicknameOptions.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">Tiada nickname tersedia untuk akaun anda.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => {
                              if (checked === true) selectAllVisible();
                              else clearAllSelected();
                            }}
                            disabled={loading}
                          />
                          <span className="text-xs font-medium">Select All</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={clearAllSelected} disabled={selectedNicknames.length === 0 || loading}>
                          Clear All
                        </Button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                        {visibleNicknameOptions.map((item) => {
                          const checked = selectedNicknameSet.has(item.nickname.toLowerCase());
                          return (
                            <label
                              key={item.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(state) => toggleNickname(item.nickname, state === true)}
                                disabled={loading}
                              />
                              <span className="text-sm">{item.nickname}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Total Records</TableHead>
                <TableHead>Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    Loading summary...
                  </TableCell>
                </TableRow>
              ) : (
                summaryRows.map((row) => (
                  <TableRow
                    key={row.month}
                    className={`cursor-pointer ${selectedMonth === row.month ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedMonth(row.month)}
                  >
                    <TableCell className="font-medium">{row.monthName}</TableCell>
                    <TableCell>{row.totalRecords}</TableCell>
                    <TableCell>{formatAmountRM(row.totalAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md border border-border/60 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold">Senarai Kutipan Bulanan</p>
            {selectedMonthSummary && selectedMonthRange ? (
              <div className="text-xs text-muted-foreground">
                <p>{selectedMonthSummary.monthName} {selectedYear}</p>
                <p>{selectedMonthRange.label}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Klik mana-mana bulan di jadual summary untuk lihat senarai kutipan customer.</p>
            )}
          </div>

          {selectedMonthSummary && (
            <div className="grid gap-2 md:grid-cols-2">
              <Card className="border-border/60 bg-background/60">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Total Records (Bulan Dipilih)</p>
                  <p className="text-lg font-semibold">{monthRecordTotals.totalRecords}</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-background/60">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Total Amount (Bulan Dipilih)</p>
                  <p className="text-lg font-semibold">{formatAmountRM(monthRecordTotals.totalAmount)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="max-h-[420px] overflow-auto rounded-md border border-border/60">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>IC Number</TableHead>
                  <TableHead>Customer Phone</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Staff Nickname</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedMonth === null ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      Sila pilih bulan terlebih dahulu.
                    </TableCell>
                  </TableRow>
                ) : loadingMonthRecords ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      Loading monthly records...
                    </TableCell>
                  </TableRow>
                ) : monthRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      Tiada rekod kutipan untuk bulan yang dipilih.
                    </TableCell>
                  </TableRow>
                ) : (
                  monthRecords.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{toDisplayDate(row.paymentDate)}</TableCell>
                      <TableCell className="font-medium">{row.customerName}</TableCell>
                      <TableCell>{row.icNumber}</TableCell>
                      <TableCell>{row.customerPhone}</TableCell>
                      <TableCell>{row.accountNumber}</TableCell>
                      <TableCell>{row.batch}</TableCell>
                      <TableCell>{formatAmountRM(row.amount)}</TableCell>
                      <TableCell>{row.collectionStaffNickname}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Grand Total Records</p>
              <p className="text-xl font-semibold">{grandTotal.totalRecords}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Grand Total Amount</p>
              <p className="text-xl font-semibold">{formatAmountRM(grandTotal.totalAmount)}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;
