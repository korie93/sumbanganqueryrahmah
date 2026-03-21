import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionNicknameSummary,
  getCollectionNicknames,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  normalizeNicknameTotals,
  type NicknameTotalSummary,
} from "@/pages/collection-nickname-summary/utils";
import {
  COLLECTION_DATA_CHANGED_EVENT,
  parseApiError,
} from "@/pages/collection/utils";

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
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames();
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      const nextOptions = Array.isArray(response?.nicknames) ? response.nicknames : [];
      setNicknameOptions(nextOptions.filter((item) => item.isActive));
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
  }, [canAccess, toast]);

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
      setLoadingSummary(true);
      try {
        const response = await getCollectionNicknameSummary({
          from,
          to,
          nicknames,
          summaryOnly: true,
        });
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        setNicknameTotals(normalizeNicknameTotals(response?.nicknameTotals));
        setTotalAmount(Number(response?.totalAmount || 0));
        setTotalRecords(Number(response?.totalRecords || 0));
        setHasApplied(true);
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        setNicknameTotals([]);
        setTotalAmount(0);
        setTotalRecords(0);
        setHasApplied(false);
        toast({
          title: "Failed to Load Nickname Summary",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
        setLoadingSummary(false);
      }
    },
    [toast],
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
    setSelectedNicknames([]);
    setFromDate("");
    setToDate("");
    setNicknameTotals([]);
    setTotalAmount(0);
    setTotalRecords(0);
    setHasApplied(false);
  }, []);

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
