import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CollectionMonthDetails } from "@/pages/collection-summary/CollectionMonthDetails";
import { CollectionSummaryFilters } from "@/pages/collection-summary/CollectionSummaryFilters";
import { CollectionSummaryTable } from "@/pages/collection-summary/CollectionSummaryTable";
import { CollectionSummaryTotals } from "@/pages/collection-summary/CollectionSummaryTotals";
import {
  buildEmptySummary,
  buildMonthRange,
  normalizeNicknameSelection,
  normalizeSummaryRows,
  toDisplayDate,
} from "@/pages/collection-summary/utils";

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

  const loadSummary = useCallback(
    async (year: number, nicknames?: string[]) => {
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
    },
    [toast],
  );

  const loadMonthRecords = useCallback(
    async (year: number, month: number, nicknames?: string[]) => {
      const requestId = ++monthRecordsRequestIdRef.current;
      setLoadingMonthRecords(true);

      try {
        const range = buildMonthRange(year, month);
        const normalizedFilters =
          Array.isArray(nicknames) && nicknames.length > 0
            ? Array.from(new Set(nicknames.map((value) => String(value || "").trim()).filter(Boolean)))
            : [];

        const response = await getCollectionRecords({
          from: range.from,
          to: range.to,
          nickname: normalizedFilters.length === 1 ? normalizedFilters[0] : undefined,
        });

        if (!isMountedRef.current || requestId !== monthRecordsRequestIdRef.current) return;

        const records: CollectionRecord[] = Array.isArray(response?.records)
          ? (response.records as CollectionRecord[])
          : [];
        const normalizedFiltersSet =
          normalizedFilters.length > 1
            ? new Set(normalizedFilters.map((value) => value.toLowerCase()))
            : null;
        const filteredRecords = normalizedFiltersSet
          ? records.filter((item: CollectionRecord) =>
              normalizedFiltersSet.has(
                String(item.collectionStaffNickname || "").trim().toLowerCase(),
              ),
            )
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
    },
    [toast],
  );

  useEffect(() => {
    void loadNicknameOptions();
  }, [loadNicknameOptions]);

  useEffect(() => {
    if (!canFilterByNickname) return;
    const visibleSet = new Set(visibleNicknameValues.map((value) => value.toLowerCase()));
    setSelectedNicknames((previous) => {
      const next = normalizeNicknameSelection(previous).filter((value) =>
        visibleSet.has(value.toLowerCase()),
      );
      if (next.length === previous.length && next.every((value, index) => value === previous[index])) {
        return previous;
      }
      return next;
    });
  }, [canFilterByNickname, visibleNicknameValues]);

  useEffect(() => {
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return;
    const nicknames = canFilterByNickname && selectedNicknames.length > 0 ? selectedNicknames : undefined;
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
    const nicknames = canFilterByNickname && selectedNicknames.length > 0 ? selectedNicknames : undefined;
    void loadMonthRecords(year, selectedMonth, nicknames);
  }, [selectedYear, selectedMonth, canFilterByNickname, selectedNicknames, loadMonthRecords]);

  const grandTotal = useMemo(
    () =>
      summaryRows.reduce(
        (acc, row) => {
          acc.totalRecords += Number(row.totalRecords) || 0;
          acc.totalAmount += Number(row.totalAmount) || 0;
          return acc;
        },
        { totalRecords: 0, totalAmount: 0 },
      ),
    [summaryRows],
  );

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

  const monthRecordTotals = useMemo(
    () =>
      monthRecords.reduce(
        (acc, row) => {
          acc.totalRecords += 1;
          const amount = Number(row.amount);
          acc.totalAmount += Number.isFinite(amount) ? amount : 0;
          return acc;
        },
        { totalRecords: 0, totalAmount: 0 },
      ),
    [monthRecords],
  );

  const selectedNicknameSet = useMemo(
    () => new Set(selectedNicknames.map((value) => value.toLowerCase())),
    [selectedNicknames],
  );

  const allSelected =
    canFilterByNickname &&
    visibleNicknameValues.length > 0 &&
    selectedNicknames.length === visibleNicknameValues.length;
  const partiallySelected =
    canFilterByNickname &&
    selectedNicknames.length > 0 &&
    selectedNicknames.length < visibleNicknameValues.length;

  const toggleNickname = (nickname: string, checked: boolean) => {
    setSelectedNicknames((previous) => {
      if (checked) {
        return normalizeNicknameSelection([...previous, nickname]);
      }
      const target = nickname.toLowerCase();
      return previous.filter((value) => value.toLowerCase() !== target);
    });
  };

  const selectAllVisible = () => {
    setSelectedNicknames(normalizeNicknameSelection(visibleNicknameValues));
  };

  const clearAllSelected = () => {
    setSelectedNicknames([]);
  };

  const selectedNicknameLabel =
    selectedNicknames.length === 0 ? "Semua staff" : `${selectedNicknames.length} nickname dipilih`;

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Collection Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CollectionSummaryFilters
          canFilterByNickname={canFilterByNickname}
          selectedYear={selectedYear}
          yearOptions={yearOptions}
          nicknameDropdownOpen={nicknameDropdownOpen}
          loading={loading}
          visibleNicknameOptions={visibleNicknameOptions}
          selectedNicknameSet={selectedNicknameSet}
          selectedNicknameLabel={selectedNicknameLabel}
          allSelected={allSelected}
          partiallySelected={partiallySelected}
          selectedNicknamesCount={selectedNicknames.length}
          onSelectedYearChange={setSelectedYear}
          onNicknameDropdownOpenChange={setNicknameDropdownOpen}
          onToggleNickname={toggleNickname}
          onSelectAllVisible={selectAllVisible}
          onClearAllSelected={clearAllSelected}
        />

        <CollectionSummaryTable
          loading={loading}
          summaryRows={summaryRows}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
        />

        <CollectionMonthDetails
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          selectedMonthSummary={selectedMonthSummary}
          selectedMonthRange={selectedMonthRange}
          monthRecords={monthRecords}
          loadingMonthRecords={loadingMonthRecords}
          monthRecordTotals={monthRecordTotals}
          toDisplayDate={toDisplayDate}
        />

        <CollectionSummaryTotals grandTotal={grandTotal} />
      </CardContent>
    </Card>
  );
}

const MemoizedCollectionSummaryPage = memo(CollectionSummaryPage);
MemoizedCollectionSummaryPage.displayName = "CollectionSummaryPage";

export default MemoizedCollectionSummaryPage;
