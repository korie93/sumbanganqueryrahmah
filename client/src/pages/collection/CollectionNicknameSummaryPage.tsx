import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionNicknameSummary,
  getCollectionNicknames,
  type CollectionRecord,
  type CollectionStaffNickname,
} from "@/lib/api";
import { CollectionNicknameBatchSections } from "@/pages/collection-nickname-summary/CollectionNicknameBatchSections";
import {
  buildNicknameBatchSections,
  buildNicknameTotals,
} from "@/pages/collection-nickname-summary/utils";
import { CollectionNicknameMultiSelect } from "@/pages/collection-report/CollectionNicknameMultiSelect";
import { parseApiError } from "@/pages/collection/utils";

type CollectionNicknameSummaryPageProps = {
  role: string;
};

function normalizeNicknameSelection(values: string[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function CollectionNicknameSummaryPage({ role }: CollectionNicknameSummaryPageProps) {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const nicknamesRequestIdRef = useRef(0);
  const summaryRequestIdRef = useRef(0);
  const canAccess = role === "admin" || role === "superuser";

  const [nicknameOptions, setNicknameOptions] = useState<CollectionStaffNickname[]>([]);
  const [nicknameDropdownOpen, setNicknameDropdownOpen] = useState(false);
  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingNicknames, setLoadingNicknames] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [records, setRecords] = useState<CollectionRecord[]>([]);
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
    selectedNicknames.length === 0 ? "Pilih staff nickname" : `${selectedNicknames.length} nickname dipilih`;

  const nicknameTotals = useMemo(() => buildNicknameTotals(records), [records]);
  const batchSections = useMemo(() => buildNicknameBatchSections(records), [records]);

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

  const toggleNickname = (nickname: string, checked: boolean) => {
    setSelectedNicknames((previous) => {
      if (checked) {
        return normalizeNicknameSelection([...previous, nickname]);
      }
      const target = nickname.toLowerCase();
      return previous.filter((value) => value.toLowerCase() !== target);
    });
  };

  const handleApply = useCallback(async () => {
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

    const requestId = ++summaryRequestIdRef.current;
    setLoadingSummary(true);
    try {
      const response = await getCollectionNicknameSummary({
        from: fromDate,
        to: toDate,
        nicknames: selectedNicknames,
      });
      if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
      setRecords(Array.isArray(response?.records) ? response.records : []);
      setTotalAmount(Number(response?.totalAmount || 0));
      setTotalRecords(Number(response?.totalRecords || 0));
      setHasApplied(true);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== summaryRequestIdRef.current) return;
      setRecords([]);
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
  }, [fromDate, selectedNicknames, toDate, toast]);

  const handleReset = () => {
    summaryRequestIdRef.current += 1;
    setSelectedNicknames([]);
    setFromDate("");
    setToDate("");
    setRecords([]);
    setTotalAmount(0);
    setTotalRecords(0);
    setHasApplied(false);
  };

  if (!canAccess) {
    return (
      <Card className="border-border/60 bg-background/70">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nickname Summary hanya tersedia untuk admin dan superuser.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Nickname Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_auto] xl:items-end">
          <CollectionNicknameMultiSelect
            label="Staff Nickname"
            open={nicknameDropdownOpen}
            loading={loadingNicknames || loadingSummary}
            selectedLabel={selectedNicknameLabel}
            options={visibleNicknameOptions}
            selectedNicknameSet={selectedNicknameSet}
            allSelected={allSelected}
            partiallySelected={partiallySelected}
            selectedCount={selectedNicknames.length}
            onOpenChange={setNicknameDropdownOpen}
            onToggleNickname={toggleNickname}
            onSelectAllVisible={() => setSelectedNicknames(normalizeNicknameSelection(visibleNicknameValues))}
            onClearAllSelected={() => setSelectedNicknames([])}
          />

          <div className="space-y-1">
            <Label>From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleApply()} disabled={loadingSummary || loadingNicknames}>
              {loadingSummary ? "Loading..." : "Apply"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={loadingSummary}>
              Reset
            </Button>
          </div>
        </div>

        <CollectionNicknameBatchSections
          loading={loadingSummary}
          hasApplied={hasApplied}
          selectedNicknames={selectedNicknames}
          fromDate={fromDate}
          toDate={toDate}
          totalAmount={totalAmount}
          totalRecords={totalRecords}
          nicknameTotals={nicknameTotals}
          batchSections={batchSections}
        />
      </CardContent>
    </Card>
  );
}

export default memo(CollectionNicknameSummaryPage);
