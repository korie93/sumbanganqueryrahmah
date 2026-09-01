import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteCollectionSourceConfig,
  getCollectionSourceConfigs,
  saveCollectionSourceConfig,
  type CollectionSourceConfig,
  type CollectionSourceConfigInput,
} from "@/lib/api/collection-source-configs";
import { useToast } from "@/hooks/use-toast";
import type { ImportItem } from "@/pages/saved/types";
import {
  getSavedSourceErrorMessage,
  isSavedSourceAbortError,
  validateSavedSourceConfigInput,
} from "@/pages/saved/saved-source-config-utils";

const emptyForm: CollectionSourceConfigInput = {
  validFrom: "",
  validTo: "",
  enabled: false,
};

function buildConfigMap(configs: CollectionSourceConfig[]) {
  return new Map(configs.map((config) => [config.sourceImportId, config] as const));
}

export function useSavedSourceConfigState(enabled: boolean) {
  const { toast } = useToast();
  const [configsByImportId, setConfigsByImportId] = useState<ReadonlyMap<string, CollectionSourceConfig>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<ImportItem | null>(null);
  const [form, setForm] = useState<CollectionSourceConfigInput>(emptyForm);
  const [formError, setFormError] = useState("");
  const [mutationPending, setMutationPending] = useState<"save" | "delete" | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationVersionRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
      mutationVersionRef.current += 1;
      setConfigsByImportId(new Map());
      setLoading(false);
      setLoadFailed(false);
      setDialogOpen(false);
      setMutationPending(null);
      setSelectedImport(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    void getCollectionSourceConfigs({ signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setConfigsByImportId(buildConfigMap(response.sourceConfigs));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isSavedSourceAbortError(error)) {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, refreshVersion]);

  useEffect(() => () => {
    mutationVersionRef.current += 1;
    mutationControllerRef.current?.abort();
    mutationControllerRef.current = null;
  }, []);

  const refresh = useCallback(() => {
    if (enabled) setRefreshVersion((value) => value + 1);
  }, [enabled]);

  const openConfig = useCallback((item: ImportItem) => {
    if (!enabled || loading || loadFailed || mutationPending) return;
    const config = configsByImportId.get(item.id);
    setSelectedImport(item);
    setForm(config
      ? { validFrom: config.validFrom, validTo: config.validTo, enabled: config.enabled }
      : emptyForm);
    setFormError("");
    setDialogOpen(true);
  }, [configsByImportId, enabled, loadFailed, loading, mutationPending]);

  const onDialogOpenChange = useCallback((open: boolean) => {
    if (mutationPending) return;
    setDialogOpen(open);
    if (!open) {
      setSelectedImport(null);
      setFormError("");
    }
  }, [mutationPending]);

  const updateForm = useCallback((patch: Partial<CollectionSourceConfigInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setFormError("");
  }, []);

  const saveConfig = useCallback(async () => {
    if (!enabled || !selectedImport || mutationPending) return;
    const validationError = validateSavedSourceConfigInput(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    const mutationVersion = mutationVersionRef.current + 1;
    mutationVersionRef.current = mutationVersion;
    mutationControllerRef.current = controller;
    setMutationPending("save");
    setFormError("");
    try {
      const response = await saveCollectionSourceConfig(selectedImport.id, form, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || mutationVersionRef.current !== mutationVersion) return;
      setConfigsByImportId((current) => {
        const next = new Map(current);
        next.set(response.config.sourceImportId, response.config);
        return next;
      });
      setDialogOpen(false);
      setSelectedImport(null);
      toast({
        title: "Collection source updated",
        description: "The active period and indexing status are now up to date.",
      });
    } catch (error) {
      if (!isSavedSourceAbortError(error)) {
        setFormError(getSavedSourceErrorMessage(
          error,
          "Source configuration could not be saved. Review the dates and try again.",
        ));
        setRefreshVersion((value) => value + 1);
      }
    } finally {
      if (mutationVersionRef.current === mutationVersion) {
        mutationControllerRef.current = null;
        setMutationPending(null);
      }
    }
  }, [enabled, form, mutationPending, selectedImport, toast]);

  const deleteConfig = useCallback(async () => {
    if (!enabled || !selectedImport || mutationPending) return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    const mutationVersion = mutationVersionRef.current + 1;
    mutationVersionRef.current = mutationVersion;
    mutationControllerRef.current = controller;
    setMutationPending("delete");
    setFormError("");
    try {
      await deleteCollectionSourceConfig(selectedImport.id, { signal: controller.signal });
      if (controller.signal.aborted || mutationVersionRef.current !== mutationVersion) return;
      setConfigsByImportId((current) => {
        const next = new Map(current);
        next.delete(selectedImport.id);
        return next;
      });
      setDialogOpen(false);
      setSelectedImport(null);
      toast({
        title: "Collection source removed",
        description: "This Saved file is no longer configured for Collection matching.",
      });
    } catch (error) {
      if (!isSavedSourceAbortError(error)) {
        setFormError(getSavedSourceErrorMessage(
          error,
          "Source configuration could not be removed. Try again.",
        ));
      }
    } finally {
      if (mutationVersionRef.current === mutationVersion) {
        mutationControllerRef.current = null;
        setMutationPending(null);
      }
    }
  }, [enabled, mutationPending, selectedImport, toast]);

  return {
    configsByImportId,
    deleteConfig,
    dialogOpen,
    form,
    formError,
    loadFailed,
    loading,
    mutationPending,
    onDialogOpenChange,
    openConfig,
    refresh,
    saveConfig,
    selectedConfig: selectedImport ? configsByImportId.get(selectedImport.id) ?? null : null,
    selectedImport,
    updateForm,
  };
}
