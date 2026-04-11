import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  buildAnalysisHeaderDescription,
  buildAnalysisSnapshotItems,
} from "@/pages/analysis/analysis-shell-utils";
import { getAnalysisSpecialIdPagedSections } from "@/pages/analysis/analysis-page-state-utils";
import type {
  AllAnalysisResult,
  AnalysisData,
  AnalysisMode,
  SingleAnalysisResult,
} from "@/pages/analysis/types";
import { getCategoryBarData, getGenderPieData, getPaginatedItems, TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

const ANALYSIS_COPY_FEEDBACK_DURATION_MS = 2_000;

type AnalysisDisplayStateOptions = {
  allResult: AllAnalysisResult | null;
  analysis: AnalysisData | null;
  importName: string;
  mode: AnalysisMode;
  singleResult: SingleAnalysisResult | null;
  totalRows: number;
};

export function useAnalysisDisplayState({
  allResult,
  analysis,
  importName,
  mode,
  singleResult,
  totalRows,
}: AnalysisDisplayStateOptions) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [duplicatesOpen, setDuplicatesOpen] = useState(true);
  const [filesListOpen, setFilesListOpen] = useState(true);
  const [tablePages, setTablePages] = useState<Record<string, number>>({});

  const copyTimersRef = useRef<number[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      copyTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      copyTimersRef.current = [];
    };
  }, []);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((previous) => ({ ...previous, [key]: !previous[key] }));
  }, []);

  const setPage = useCallback((key: string, page: number, totalItems: number) => {
    const maxPage = Math.max(0, Math.ceil(totalItems / TABLE_PAGE_SIZE) - 1);
    const nextPage = Math.max(0, Math.min(maxPage, page));
    setTablePages((previous) => {
      if (previous[key] === nextPage) return previous;
      return { ...previous, [key]: nextPage };
    });
  }, []);

  const markCopied = useCallback((key: string) => {
    setCopiedItems((previous) => ({ ...previous, [key]: true }));
    const timerId = window.setTimeout(() => {
      setCopiedItems((previous) => ({ ...previous, [key]: false }));
      copyTimersRef.current = copyTimersRef.current.filter((id) => id !== timerId);
    }, ANALYSIS_COPY_FEEDBACK_DURATION_MS);
    copyTimersRef.current.push(timerId);
  }, []);

  const copyToClipboard = useCallback((text: string, itemKey?: string) => {
    void navigator.clipboard.writeText(text);
    if (itemKey) {
      markCopied(itemKey);
    }
    toast({
      title: "Copied",
      description: "Text has been copied to clipboard.",
    });
  }, [markCopied, toast]);

  const copyAllToClipboard = useCallback((items: string[], sectionKey: string) => {
    void navigator.clipboard.writeText(items.join("\n"));
    markCopied(`all-${sectionKey}`);
    toast({
      title: "Copied",
      description: `${items.length} items have been copied to clipboard.`,
    });
  }, [markCopied, toast]);

  const genderPieData = useMemo(() => getGenderPieData(analysis), [analysis]);
  const categoryBarData = useMemo(() => getCategoryBarData(analysis), [analysis]);
  const filesPaged = useMemo(
    () => getPaginatedItems("files-list", allResult?.imports || [], tablePages),
    [allResult?.imports, tablePages],
  );
  const duplicatesPaged = useMemo(
    () => getPaginatedItems("duplicates-list", analysis?.duplicates.items || [], tablePages),
    [analysis?.duplicates.items, tablePages],
  );
  const specialIdPagedSections = useMemo(
    () => getAnalysisSpecialIdPagedSections(analysis, tablePages),
    [analysis, tablePages],
  );
  const headerDescription = useMemo(
    () => buildAnalysisHeaderDescription({ importName, mode }),
    [importName, mode],
  );
  const snapshotItems = useMemo(
    () =>
      buildAnalysisSnapshotItems({
        allResult,
        analysis,
        mode,
        singleResult,
        totalRows,
      }),
    [allResult, analysis, mode, singleResult, totalRows],
  );

  return {
    expandedSections,
    copiedItems,
    duplicatesOpen,
    filesListOpen,
    genderPieData,
    categoryBarData,
    filesPaged,
    duplicatesPaged,
    specialIdPagedSections,
    headerDescription,
    snapshotItems,
    setDuplicatesOpen,
    setFilesListOpen,
    toggleSection,
    setPage,
    copyToClipboard,
    copyAllToClipboard,
  };
}
