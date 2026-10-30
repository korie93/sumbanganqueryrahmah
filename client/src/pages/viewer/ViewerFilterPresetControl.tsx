import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  VIEWER_FILTER_PRESET_MAX_PER_IMPORT, VIEWER_FILTER_PRESET_NAME_MAX_LENGTH,
  viewerFilterPresetNameSchema, type ViewerFilterPreset,
} from "@shared/common/viewer-filter-presets";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";
import type { ColumnFilter } from "./types";
import type { ViewerFilterPresetState } from "./useViewerFilterPresets";
import { buildViewerPresetPayload, getViewerPresetCompatibilityIssue } from "./viewer-preset-utils";

type Props = {
  headers: string[]; columnFilters: ColumnFilter[]; numericSort: ImportDataNumericSort | null;
  state: ViewerFilterPresetState;
  onApply: (preset: ViewerFilterPreset) => boolean;
};

function ViewerFilterPresetControlImpl({ headers, columnFilters, numericSort, state, onApply }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"save" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<"save" | "select" | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { if (mode === "save" || mode === "rename") { inputRef.current?.focus(); inputRef.current?.select(); } }, [mode]);
  const selected = state.presets.find(preset => preset.id === selectedId);
  const ready = state.available && state.status === "ready" && !state.pending;
  const compatibilityIssue = selected ? getViewerPresetCompatibilityIssue(selected, headers) : null;
  const draft = buildViewerPresetPayload("Current filters", columnFilters, numericSort, headers);
  const atLimit = state.presets.length >= VIEWER_FILTER_PRESET_MAX_PER_IMPORT;
  useEffect(() => {
    const intent = returnFocusRef.current;
    if (mode !== null || !intent || state.pending || !mountedRef.current) return;
    // Wait for the committed form removal and enabled controls. Focusing from
    // finishMode would target controls that are still disabled in that render.
    const preferred = intent === "save" ? saveRef.current : selectRef.current;
    const fallback = intent === "save" ? selectRef.current : saveRef.current;
    const target = preferred?.isConnected && !preferred.disabled ? preferred
      : fallback?.isConnected && !fallback.disabled ? fallback : sectionRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [mode, state.pending, state.status, state.presets.length, draft.ok, atLimit]);
  const startMode = (next: "save" | "rename" | "delete") => {
    returnFocusRef.current = null;
    setName(next === "rename" ? selected?.name ?? "" : "");
    setLocalError(""); setMessage(""); setMode(next);
  };
  const finishMode = () => {
    returnFocusRef.current = mode === "save" ? "save" : "select";
    setMode(null);
    setLocalError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !mode) return;
    if (mode === "delete") {
      if (!selected) return;
      const result = await state.remove(selected.id);
      if (!mountedRef.current || result === null) return;
      setSelectedId(""); finishMode();
      return;
    }
    const normalized = viewerFilterPresetNameSchema.safeParse(name);
    if (!normalized.success) { setLocalError(`Enter a preset name of 1–${VIEWER_FILTER_PRESET_NAME_MAX_LENGTH} characters.`); inputRef.current?.focus(); return; }
    if (mode === "save") {
      const result = buildViewerPresetPayload(normalized.data, columnFilters, numericSort, headers);
      if (!result.ok) { setLocalError(result.message); return; }
      const saved = await state.create(result.payload);
      if (!mountedRef.current || saved === null || typeof saved === "string") return;
      setSelectedId(saved.id); finishMode();
    } else if (selected) {
      const saved = await state.rename(selected.id, normalized.data);
      if (!mountedRef.current || saved === null) return;
      finishMode();
    }
  };
  const apply = () => {
    if (!ready || !selected || compatibilityIssue) return;
    setLocalError("");
    if (onApply(selected)) setMessage(`Applied preset “${selected.name}”.`);
  };
  const error = localError || state.error || compatibilityIssue;

  return (
    <section ref={sectionRef} tabIndex={-1} className="mb-4 min-w-0 space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-labelledby="viewer-presets-title" aria-busy={state.status === "loading" || state.pending}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 id="viewer-presets-title" className="flex items-center gap-1.5 text-sm font-medium"><Bookmark className="h-4 w-4" aria-hidden="true" />Saved presets</h4>
          <p className="text-xs text-muted-foreground">Private to your account and this file. Saves filters and numeric sort.</p>
        </div>
        <Button ref={saveRef} type="button" variant="outline" size="sm" disabled={!ready || !draft.ok || atLimit || mode !== null} onClick={() => startMode("save")} data-testid="button-save-viewer-preset">Save preset</Button>
      </div>
      {!state.available ? <p className="text-xs text-muted-foreground">Presets are unavailable for this session.</p> : state.status === "loading" || state.status === "idle" ? (
        <p role="status" className="text-xs text-muted-foreground">Loading your presets…</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="viewer-preset-select" className="text-xs">Saved preset</Label>
            <select id="viewer-preset-select" name="viewerPreset" ref={selectRef} value={selected ? selectedId : ""} disabled={!ready || mode !== null || state.presets.length === 0}
              onChange={event => { setSelectedId(event.target.value); setLocalError(""); setMessage(""); }}
              className="h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-9" data-testid="viewer-preset-select">
              <option value="">{state.presets.length ? "Choose a preset" : "No saved presets"}</option>
              {state.presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={!ready || !selected || Boolean(compatibilityIssue) || mode !== null} onClick={apply} data-testid="button-apply-viewer-preset">Apply</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!ready || !selected || mode !== null} onClick={() => startMode("rename")} data-testid="button-rename-viewer-preset">Rename</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!ready || !selected || mode !== null} onClick={() => startMode("delete")} data-testid="button-delete-viewer-preset">Delete</Button>
          </div>
        </div>
      )}
      {state.error ? <Button type="button" variant="outline" size="sm" disabled={state.pending} onClick={state.reload} data-testid="button-retry-viewer-presets">{state.status === "error" ? "Retry" : "Refresh presets"}</Button> : null}
      {mode ? (
        <form onSubmit={event => { void submit(event); }} className="space-y-2 border-t border-border/60 pt-3" aria-label={mode === "delete" ? "Delete saved preset" : mode === "save" ? "Save current filters" : "Rename saved preset"}>
          {mode === "delete" ? <p className="break-words text-sm">Delete “{selected?.name}”? Your current filters stay unchanged.</p> : (
            <div className="space-y-1">
              <Label htmlFor="viewer-preset-name" className="text-xs">Preset name</Label>
              <Input id="viewer-preset-name" name="viewerPresetName" ref={inputRef} value={name} maxLength={VIEWER_FILTER_PRESET_NAME_MAX_LENGTH} autoComplete="off" disabled={state.pending}
                onChange={event => { setName(event.target.value); setLocalError(""); }} aria-invalid={Boolean(localError) || undefined} aria-describedby={error ? "viewer-preset-error" : undefined} data-testid="input-viewer-preset-name" />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={mode === "delete" ? "destructive" : "default"} size="sm" disabled={!ready} data-testid="button-confirm-viewer-preset">{state.pending ? (mode === "delete" ? "Deleting…" : "Saving…") : mode === "delete" ? "Delete preset" : mode === "rename" ? "Rename" : "Save"}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={state.pending} onClick={finishMode} data-testid="button-cancel-viewer-preset">Cancel</Button>
          </div>
        </form>
      ) : null}
      {atLimit && !mode ? <p className="text-xs text-muted-foreground">Maximum {VIEWER_FILTER_PRESET_MAX_PER_IMPORT} presets per file. Delete a preset to save another.</p> : null}
      {!draft.ok && !mode && ready ? <p className="text-xs text-muted-foreground">{draft.message}</p> : null}
      {error ? <p id="viewer-preset-error" role="alert" className="break-words text-xs text-destructive" data-testid="viewer-preset-error">{error}</p> : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="break-words text-xs text-muted-foreground" data-testid="viewer-preset-status">{message || state.message}</p>
    </section>
  );
}

export const ViewerFilterPresetControl = memo(ViewerFilterPresetControlImpl);
