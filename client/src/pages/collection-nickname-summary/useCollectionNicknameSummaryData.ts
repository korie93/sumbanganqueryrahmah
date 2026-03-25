import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionNicknameSummary,
  getCollectionNicknames,
  type CollectionReportFreshness,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  normalizeNicknameTotals,
  type NicknameTotalSummary,
} from "@/pages/collection-nickname-summary/utils";
import {
  buildCollectionNicknameSummaryCacheKey,
  createCollectionNicknameSummaryCache,
} from "@/pages/collection-nickname-summary/nickname-summary-cache";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function normalizeNicknameSelection(values: string[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

type UseCollectionNicknameSummaryDataOptions = {
  canAccess: boolean;
};

type UseCollectionNicknameSummaryDataValue = {
  nicknameOptions: CollectionStaffNickname[];
  nicknameDropdownOpen: boolean;
  selectedNicknames: string[];
  selectedNicknameSet: Set<string>;
  selectedNicknameLabel: string;
  fromDate: string;
  toDate: string;
  loadingNicknames: boolean;
  loadingSummary: boolean;
  totalAmount: number;
  totalRecords: number;
  hasApplied: boolean;
  freshness: CollectionReportFreshness | null;
  allSelected: boolean;
  partiallySelected: boolean;
  nicknameTotals: NicknameTotalSummary[];
  setNicknameDropdownOpen: (open: boolean) => void;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  toggleNickname: (nickname: string, checked: boolean) => void;
  selectAllVisible: () => void;
  clearAllSelected: () => void;
  apply: () => Promise<void>;
  reset: () => void;
};

export function useCollectionNicknameSummaryData({
  canAccess,
}: UseCollectionNicknameSummaryDataOptions): UseCollectionNicknameSummaryDataValue {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const nicknamesRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const nicknamesAbortControllerRef = useRef<AbortController | null>(null);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const summaryCacheRef = useRef(createCollectionNicknameSummaryCache());

  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [nicknameDropdownOpen, setNicknameDropdownOpen] = useState(false);
  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingNicknames, setLoadingNicknames] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [nicknameTotals, setNicknameTotals] = useState<NicknameTotalSummary[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasApplied, setHasApplied] = useState(false);
  const [freshness, setFreshness] = useState<CollectionReportFreshness | null>(null);

  const abortNicknamesRequest = useCallback(() => {
    if (nicknamesAbortControllerRef.current) {
      nicknamesAbortControllerRef.current.abort();
      nicknamesAbortControllerRef.current = null;
    }
  }, []);

  const abortSummaryRequest = useCallback(() => {
    if (summaryAbortControllerRef.current) {
      summaryAbortControllerRef.current.abort();
      summaryAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortNicknamesRequest();
      abortSummaryRequest();
      summaryCacheRef.current.clear();
    };
  }, [abortNicknamesRequest, abortSummaryRequest]);

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

  const selectedNicknameSet = useMemo(
    () => new Set(selectedNicknames.map((value) => value.toLowerCase())),
    [selectedNicknames],
  );

  const allSelected =
    visibleNicknameValues.length > 0 &&
    selectedNicknames.length === visibleNicknameValues.length;
  const partiallySelected =
    selectedNicknames.length > 0 &&
    selectedNicknames.length < visibleNicknameValues.length;
  const selectedNicknameLabel =
    selectedNicknames.length === 0
      ? "Pilih staff nickname"
      : `${selectedNicknames.length} nickname dipilih`;

  const loadNicknames = useCallback(async () => {
    if (!canAccess) return;
    const requestId = ++nicknamesRequestIdRef.current;
    abortNicknamesRequest();
    const controller = new AbortController();
    nicknamesAbortControllerRef.current = controller;
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames(undefined, {
        signal: controller.signal,
      });
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const nextOptions = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(nextOptions.filter((item) => item.isActive));
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (nicknamesAbortControllerRef.current === controller) {
        nicknamesAbortControllerRef.current = null;
      }
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      setLoadingNicknames(false);
    }
  }, [abortNicknamesRequest, canAccess, toast]);

  useEffect(() => {
    void loadNicknames();
  }, [loadNicknames]);

  useEffect(() => {
    if (!canAccess) return;
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
  }, [canAccess, visibleNicknameValues]);

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

  const loadSummary = useCallback(
    async (from: string, to: string, nicknames: string[]) => {
      const requestId = ++summaryRequestIdRef.current;
      const cacheKey = buildCollectionNicknameSummaryCacheKey({
        from,
        to,
        nicknames,
      });
      const cachedEntry = summaryCacheRef.current.get(cacheKey);
      if (cachedEntry) {
        abortSummaryRequest();
        setNicknameTotals(cachedEntry.nicknameTotals);
        setTotalAmount(cachedEntry.totalAmount);
        setTotalRecords(cachedEntry.totalRecords);
        setFreshness(cachedEntry.freshness);
        setHasApplied(true);
        setLoadingSummary(false);
        return;
      }

      abortSummaryRequest();
      const controller = new AbortController();
      summaryAbortControllerRef.current = controller;
      setLoadingSummary(true);
      try {
        const response = await getCollectionNicknameSummary({
          from,
          to,
          nicknames,
          summaryOnly: true,
        }, {
          signal: controller.signal,
        });
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        const normalizedNicknameTotals = normalizeNicknameTotals(response?.nicknameTotals);
        const normalizedTotalAmount = Number(response?.totalAmount || 0);
        const normalizedTotalRecords = Number(response?.totalRecords || 0);
        summaryCacheRef.current.set(cacheKey, {
          nicknameTotals: normalizedNicknameTotals,
          totalAmount: normalizedTotalAmount,
          totalRecords: normalizedTotalRecords,
          freshness: response?.freshness || null,
        });
        setNicknameTotals(normalizedNicknameTotals);
        setTotalAmount(normalizedTotalAmount);
        setTotalRecords(normalizedTotalRecords);
        setFreshness(response?.freshness || null);
        setHasApplied(true);
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) return;
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        setNicknameTotals([]);
        setTotalAmount(0);
        setTotalRecords(0);
        setFreshness(null);
        setHasApplied(false);
        toast({
          title: "Failed to Load Nickname Summary",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (summaryAbortControllerRef.current === controller) {
          summaryAbortControllerRef.current = null;
        }
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        setLoadingSummary(false);
      }
    },
    [abortSummaryRequest, toast],
  );

  const apply = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast({
        title: "Validation Error",
        description: "Please choose both From Date and To Date.",
        variant: "destructive",
      });
      return;
    }
    if (fromDate > toDate) {
      toast({
        title: "Validation Error",
        description: "From Date cannot be later than To Date.",
        variant: "destructive",
      });
      return;
    }
    if (selectedNicknames.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one nickname.",
        variant: "destructive",
      });
      return;
    }

    await loadSummary(fromDate, toDate, selectedNicknames);
  }, [fromDate, loadSummary, selectedNicknames, toDate, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCollectionDataChanged = () => {
      summaryCacheRef.current.clear();
      if (!hasApplied || !fromDate || !toDate || selectedNicknames.length === 0) {
        return;
      }
      void loadSummary(fromDate, toDate, selectedNicknames);
    };

    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    return () => {
      window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, handleCollectionDataChanged);
    };
  }, [fromDate, hasApplied, loadSummary, selectedNicknames, toDate]);

  const reset = useCallback(() => {
    summaryRequestIdRef.current += 1;
    abortSummaryRequest();
    setSelectedNicknames([]);
    setFromDate("");
    setToDate("");
    setNicknameTotals([]);
    setTotalAmount(0);
    setTotalRecords(0);
    setFreshness(null);
    setHasApplied(false);
  }, [abortSummaryRequest]);

  return {
    nicknameOptions: visibleNicknameOptions,
    nicknameDropdownOpen,
    selectedNicknames,
    selectedNicknameSet,
    selectedNicknameLabel,
    fromDate,
    toDate,
    loadingNicknames,
    loadingSummary,
    totalAmount,
    totalRecords,
    hasApplied,
    freshness,
    allSelected,
    partiallySelected,
    nicknameTotals,
    setNicknameDropdownOpen,
    setFromDate,
    setToDate,
    toggleNickname,
    selectAllVisible,
    clearAllSelected,
    apply,
    reset,
  };
}
