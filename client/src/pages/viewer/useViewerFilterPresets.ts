import { useCallback, useEffect, useRef, useState } from "react";
import {
  createViewerFilterPreset, deleteViewerFilterPreset, getViewerFilterPresets, renameViewerFilterPreset,
} from "@/lib/api/viewer-presets";
import { getApiErrorMessage } from "@/lib/api-errors";
import { withReadDeadline } from "@/lib/read-deadline";
import type { ViewerFilterPreset } from "@shared/common/viewer-filter-presets";
import type { buildViewerPresetPayload } from "./viewer-preset-utils";

type PresetPayload = Extract<ReturnType<typeof buildViewerPresetPayload>, { ok: true }>["payload"];
type PresetState = {
  scope: string; presets: ViewerFilterPreset[]; status: "idle" | "loading" | "ready" | "error";
  pending: boolean; error: string; message: string;
};
const emptyState = (scope: string): PresetState => ({ scope, presets: [], status: "idle", pending: false, error: "", message: "" });

export function useViewerFilterPresets({ accountId, importId, enabled }: {
  accountId: string | undefined; importId: string | undefined; enabled: boolean;
}) {
  const scope = JSON.stringify([accountId, importId]);
  const available = Boolean(accountId && importId);
  const [state, setState] = useState(() => emptyState(scope));
  const [revision, setRevision] = useState(0);
  const currentScopeRef = useRef(scope);
  currentScopeRef.current = scope;
  const ownerRef = useRef<AbortController | null>(null);
  const loadedScopeRef = useRef("");
  const pendingRef = useRef(false);

  useEffect(() => {
    loadedScopeRef.current = "";
    pendingRef.current = false;
    setState(emptyState(scope));
    return () => { ownerRef.current?.abort(); ownerRef.current = null; pendingRef.current = false; };
  }, [scope]);

  useEffect(() => {
    if (!available || !enabled || !importId || loadedScopeRef.current === scope) return;
    const controller = new AbortController();
    ownerRef.current?.abort();
    ownerRef.current = controller;
    setState({ ...emptyState(scope), status: "loading" });
    const isCurrent = () => !controller.signal.aborted && ownerRef.current === controller && currentScopeRef.current === scope;
    void withReadDeadline(signal => getViewerFilterPresets(importId, { signal }), controller.signal, 30_000).then(result => {
      if (!isCurrent()) return;
      loadedScopeRef.current = scope;
      setState({ ...emptyState(scope), status: "ready", presets: result.presets });
    }).catch(error => {
      if (isCurrent()) setState({ ...emptyState(scope), status: "error", error: getApiErrorMessage(error, "Could not load your presets. Try again.") });
    });
    return () => { if (ownerRef.current === controller) { controller.abort(); ownerRef.current = null; } };
  }, [available, enabled, importId, revision, scope]);

  const reload = useCallback(() => {
    if (pendingRef.current) return;
    loadedScopeRef.current = "";
    setRevision(value => value + 1);
  }, []);

  const mutate = useCallback(async (
    operation: (id: string, signal: AbortSignal) => Promise<ViewerFilterPreset | string>,
    message: string,
  ): Promise<ViewerFilterPreset | string | null> => {
    if (!available || !importId || pendingRef.current || state.scope !== scope || state.status !== "ready") return null;
    const controller = new AbortController();
    ownerRef.current?.abort();
    ownerRef.current = controller;
    pendingRef.current = true;
    setState(previous => ({ ...previous, pending: true, error: "", message: "" }));
    const isCurrent = () => !controller.signal.aborted && ownerRef.current === controller && currentScopeRef.current === scope;
    try {
      const result = await withReadDeadline(signal => operation(importId, signal), controller.signal, 30_000);
      if (!isCurrent()) return null;
      setState(previous => ({ ...previous, pending: false, error: "", message,
        presets: typeof result === "string" ? previous.presets.filter(preset => preset.id !== result)
          : [...previous.presets.filter(preset => preset.id !== result.id), result].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return result;
    } catch (error) {
      if (isCurrent()) setState(previous => ({ ...previous, pending: false, message: "", error: getApiErrorMessage(error, "Could not update your preset. Try again.") }));
      return null;
    } finally {
      if (ownerRef.current === controller) { pendingRef.current = false; ownerRef.current = null; }
    }
  }, [available, importId, scope, state.scope, state.status]);

  const create = useCallback((payload: PresetPayload) => mutate(async (id, signal) =>
    (await createViewerFilterPreset(id, payload, { signal })).preset, "Preset saved."), [mutate]);
  const rename = useCallback((presetId: string, name: string) => mutate(async (id, signal) =>
    (await renameViewerFilterPreset(id, presetId, name, { signal })).preset, "Preset renamed."), [mutate]);
  const remove = useCallback((presetId: string) => mutate(async (id, signal) => {
    await deleteViewerFilterPreset(id, presetId, { signal });
    return presetId;
  }, "Preset deleted."), [mutate]);

  const visibleState = state.scope === scope ? state : emptyState(scope);
  return { ...visibleState, available, reload, create, rename, remove };
}

export type ViewerFilterPresetState = ReturnType<typeof useViewerFilterPresets>;
