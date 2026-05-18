import { ArrowRight, GitCompare } from "lucide-react";
import type { AuditChangeSummary } from "@/pages/audit-logs/audit-log-classification";

type AuditLogChangeDiffViewerProps = {
  changes: AuditChangeSummary[];
};

export function AuditLogChangeDiffViewer({ changes }: AuditLogChangeDiffViewerProps) {
  if (changes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border/70 bg-muted/20 p-3" aria-labelledby="audit-change-summary-title">
      <h3
        id="audit-change-summary-title"
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
        Before / After
      </h3>
      <div className="mt-3 space-y-3">
        {changes.map((change, index) => (
          <article
            key={`${change.field}:${index}`}
            className="rounded-xl border border-border/60 bg-background/75 p-3"
          >
            <p className="text-sm font-semibold text-foreground">{change.field}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Before
                </p>
                <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
                  {change.before}
                </p>
              </div>
              <div className="flex items-center justify-center text-muted-foreground" aria-hidden="true">
                <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                  After
                </p>
                <p className="mt-1.5 break-words text-sm leading-relaxed">
                  {change.after}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

