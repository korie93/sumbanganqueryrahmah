import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildSaveCollectionProgressSteps,
  type SaveCollectionSubmitPhase,
} from "@/pages/collection/save-collection-submit-progress";
import type { SaveCollectionSubmitFailure } from "@/pages/collection/save-collection-submit-feedback";

type SaveCollectionProgressProps = {
  phase: SaveCollectionSubmitPhase;
  receiptCount: number;
  failure: SaveCollectionSubmitFailure | null;
  visible: boolean;
};

function StepIcon({ state }: { state: ReturnType<typeof buildSaveCollectionProgressSteps>[number]["state"] }) {
  if (state === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (state === "failed") {
    return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  }
  if (state === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />;
  }
  return <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export function SaveCollectionProgress({
  phase,
  receiptCount,
  failure,
  visible,
}: SaveCollectionProgressProps) {
  if (!visible) {
    return null;
  }

  const steps = buildSaveCollectionProgressSteps({ phase, receiptCount, failure });

  return (
    <section
      className="rounded-xl border border-border/60 bg-muted/10 p-3"
      aria-label="Save collection progress"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Save progress</h3>
          <p className="text-xs text-muted-foreground">
            Sistem validate, upload, scan, dan save dalam satu request yang selamat.
          </p>
        </div>
        {phase === "processing" ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Processing
          </span>
        ) : null}
      </div>
      <ol className="grid gap-2 md:grid-cols-5">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "rounded-lg border bg-background/70 p-2.5",
              step.state === "active" ? "border-primary/40" : "border-border/60",
              step.state === "failed" ? "border-destructive/35 bg-destructive/5" : "",
            )}
          >
            <div className="flex items-center gap-2">
              <StepIcon state={step.state} />
              <span className="text-xs font-semibold text-foreground">{step.label}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
