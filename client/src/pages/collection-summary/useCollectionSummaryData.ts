import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionMonthlySummary,
  getCollectionNicknames,
  type CollectionMonthlySummary,
  type CollectionStaffNickname,
} from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import {
  buildEmptySummary,
  normalizeNicknameSelection,
  normalizeSummaryRows,
} from "@/pages/collection-summary/utils";

type UseCollectionSummaryDataArgs = {
  canFilterByNickname: boolean;
};

export function useCollectionSummaryData({
  canFilterByNickname,
}: UseCollectionSummaryDataArgs) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const summaryRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
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
  const [summaryRows, setSummaryRows] = useState<CollectionMonthlySummary[]>(() =>
    buildEmptySummary(),
  );

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
      if (
        next.length === previous.length &&
        next.every((value, index) => value === previous[index])
      ) {
        return previous;
      }
      return next;
    });
  }, [canFilterByNickname, visibleNicknameValues]);

  useEffect(() => {
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return;
    const nicknames =
      canFilterByNickname && selectedNicknames.length > 0
        ? selectedNicknames
        : undefined;
    void loadSummary(year, nicknames);
  }, [selectedYear, canFilterByNickname, selectedNicknames, loadSummary]);

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

  const toggleNickname = useCallback((nickname: string, checked: boolean) => {
    setSelectedNicknames((previous) => {
      if (checked) {
        return normalizeNicknameSelection([...previous, nickname]);
      }
      const target = nickname.toLowerCase();
      return previous.filter((value) => value.toLowerCase() !== target);
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedNicknames(normalizeNicknameSelection(visibleNicknameValues));
  }, [visibleNicknameValues]);

  const clearAllSelected = useCallback(() => {
    setSelectedNicknames([]);
  }, []);

  const selectedNicknameLabel =
    selectedNicknames.length === 0
      ? "Semua staff"
      : `${selectedNicknames.length} nickname dipilih`;

  return {
    currentYear,
    yearOptions,
    selectedYear,
    nicknameDropdownOpen,
    loading,
    summaryRows,
    visibleNicknameOptions,
    selectedNicknameSet,
    selectedNicknameLabel,
    allSelected,
    partiallySelected,
    selectedNicknames,
    grandTotal,
    setSelectedYear,
    setNicknameDropdownOpen,
    toggleNickname,
    selectAllVisible,
    clearAllSelected,
  };
}
