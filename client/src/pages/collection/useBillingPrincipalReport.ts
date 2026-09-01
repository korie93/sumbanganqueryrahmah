import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBillingPrincipalReport,
  type BillingPrincipalAging,
  type BillingPrincipalReportResponse,
} from "@/lib/api/collection-billing-principal";
import {
  getCollectionSourceConfigs,
  type CollectionSourceConfig,
} from "@/lib/api/collection-source-configs";
import { getCollectionNicknames } from "@/lib/api/collection-nicknames";
import type { CollectionStaffNickname } from "@/lib/api/collection-types";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  getCurrentMonthDateRange,
} from "./billing-principal-report-utils";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useBillingPrincipalReport() {
  const initialRange = useMemo(() => getCurrentMonthDateRange(), []);
  const [sourceConfigs, setSourceConfigs] = useState<CollectionSourceConfig[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [nicknames, setNicknames] = useState<CollectionStaffNickname[]>([]);
  const [selectedNickname, setSelectedNickname] = useState("");
  const [selectedAgings, setSelectedAgings] = useState<BillingPrincipalAging[]>(
    BILLING_PRINCIPAL_AGINGS,
  );
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<BillingPrincipalReportResponse["report"] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [reportError, setReportError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError("");
    Promise.all([
      getCollectionSourceConfigs({ signal: controller.signal }),
      getCollectionNicknames(undefined, { signal: controller.signal }),
    ])
      .then(([sourceResponse, nicknameResponse]) => {
        if (controller.signal.aborted) return;
        const compatible = sourceResponse.sourceConfigs.filter(
          (config) => config.compatibilityStatus === "compatible",
        );
        setSourceConfigs(compatible);
        setNicknames(nicknameResponse.nicknames.filter((nickname) => nickname.isActive));
        setSelectedSourceIds((current) => {
          const stillAvailable = current.filter((id) =>
            compatible.some((config) => config.sourceImportId === id),
          );
          if (stillAvailable.length > 0) return stillAvailable.slice(0, 5);
          const preferred = compatible.find((config) => config.status === "active") || compatible[0];
          return preferred ? [preferred.sourceImportId] : [];
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setOptionsError(parseApiError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOptions(false);
      });
    return () => controller.abort();
  }, []);

  const sourceKey = selectedSourceIds.join(",");
  const agingKey = selectedAgings.join(",");
  useEffect(() => {
    if (selectedSourceIds.length < 1 || selectedSourceIds.length > 5) {
      setLoadingReport(false);
      setReport(null);
      setReportError(
        selectedSourceIds.length > 5
          ? "Choose no more than 5 source files."
          : "Choose at least one configured source file.",
      );
      return;
    }
    if (!from || !to || from > to) {
      setLoadingReport(false);
      setReport(null);
      setReportError("Date From cannot be later than Date To.");
      return;
    }
    if (selectedAgings.length === 0) {
      setLoadingReport(false);
      setReport(null);
      setReportError("Choose at least one aging bucket.");
      return;
    }

    const controller = new AbortController();
    setLoadingReport(true);
    setReportError("");
    getBillingPrincipalReport({
      sourceImportIds: selectedSourceIds,
      from,
      to,
      agingBuckets: selectedAgings,
      ...(selectedNickname ? { nickname: selectedNickname } : {}),
    }, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setReport(response.report);
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setReport(null);
          setReportError(parseApiError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [agingKey, from, refreshVersion, selectedNickname, sourceKey, to]);

  const toggleSource = useCallback((sourceImportId: string) => {
    setSelectedSourceIds((current) => {
      if (current.includes(sourceImportId)) {
        return current.filter((id) => id !== sourceImportId);
      }
      return current.length >= 5 ? current : [...current, sourceImportId];
    });
  }, []);

  const toggleAging = useCallback((aging: BillingPrincipalAging) => {
    setSelectedAgings((current) => current.includes(aging)
      ? current.filter((item) => item !== aging)
      : BILLING_PRINCIPAL_AGINGS.filter((item) => item === aging || current.includes(item)));
  }, []);

  return {
    sourceConfigs,
    selectedSourceIds,
    nicknames,
    selectedNickname,
    selectedAgings,
    from,
    to,
    report,
    loadingOptions,
    loadingReport,
    optionsError,
    reportError,
    setSelectedNickname,
    setFrom,
    setTo,
    toggleSource,
    toggleAging,
    refresh: () => setRefreshVersion((value) => value + 1),
  };
}
