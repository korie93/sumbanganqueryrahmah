import { Bookmark, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildAuditLogSavedView,
  getBuiltInAuditLogSavedViews,
  readCustomAuditLogSavedViews,
  writeCustomAuditLogSavedViews,
  type AuditLogSavedView,
} from "@/pages/audit-logs/audit-log-saved-views";
import type { AuditLogFilters } from "@/pages/audit-logs/types";

type AuditLogsSavedViewsPanelProps = {
  filters: AuditLogFilters;
  hasActiveFilters: boolean;
  onApplyFilters: (filters: AuditLogFilters) => void;
};

export function AuditLogsSavedViewsPanel({
  filters,
  hasActiveFilters,
  onApplyFilters,
}: AuditLogsSavedViewsPanelProps) {
  const [customViews, setCustomViews] = useState<AuditLogSavedView[]>(() => readCustomAuditLogSavedViews());
  const [viewName, setViewName] = useState("");
  const savedViews = useMemo(
    () => [...getBuiltInAuditLogSavedViews(), ...customViews],
    [customViews],
  );

  const handleApplyView = useCallback((view: AuditLogSavedView) => {
    onApplyFilters(view.filters);
  }, [onApplyFilters]);

  const handleSaveCurrentView = useCallback(() => {
    const nextView = buildAuditLogSavedView(filters, viewName);
    const nextViews = [nextView, ...customViews.filter((view) => view.label !== nextView.label)].slice(0, 8);
    if (writeCustomAuditLogSavedViews(nextViews)) {
      setCustomViews(nextViews);
      setViewName("");
    }
  }, [customViews, filters, viewName]);

  const handleDeleteView = useCallback((viewId: string) => {
    const nextViews = customViews.filter((view) => view.id !== viewId);
    if (writeCustomAuditLogSavedViews(nextViews)) {
      setCustomViews(nextViews);
    }
  }, [customViews]);

  return (
    <section className="space-y-3 border-b px-6 pb-4" aria-labelledby="audit-saved-views-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            id="audit-saved-views-title"
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            Saved Views
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Apply common audit views quickly, or save your current filter set for later review.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:w-72">
          <Label htmlFor="audit-saved-view-name" className="sr-only">
            Saved audit view name
          </Label>
          <div className="flex gap-2">
            <Input
              id="audit-saved-view-name"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              placeholder="Name current view..."
              maxLength={48}
              disabled={!hasActiveFilters}
              data-testid="input-audit-saved-view-name"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveCurrentView}
              disabled={!hasActiveFilters}
              data-testid="button-save-audit-view"
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {savedViews.map((view) => (
          <div
            key={view.id}
            className="flex min-w-[12rem] max-w-[16rem] items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 p-2"
          >
            <button
              type="button"
              className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => handleApplyView(view)}
              title={view.description}
              data-testid={`button-apply-audit-view-${view.id}`}
            >
              <span className="block truncate text-sm font-medium text-foreground">{view.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{view.description}</span>
            </button>
            {view.source === "custom" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => handleDeleteView(view.id)}
                aria-label={`Delete saved audit view ${view.label}`}
                data-testid={`button-delete-audit-view-${view.id}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
