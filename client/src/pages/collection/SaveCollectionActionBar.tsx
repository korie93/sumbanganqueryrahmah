import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveCollectionActionBarProps = {
  keyboardOpen: boolean;
  onClear: () => void;
  onSave: () => void;
  submitting: boolean;
};

export function SaveCollectionActionBar({
  keyboardOpen,
  onClear,
  onSave,
  submitting,
}: SaveCollectionActionBarProps) {
  return (
    <div
      className={cn(
        "-mx-6 flex flex-col gap-2 border-t border-border/60 bg-background/95 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:flex-row sm:flex-wrap sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 sm:shadow-none sm:backdrop-blur-0",
        keyboardOpen ? "static" : "sticky bottom-0 z-[var(--z-sticky-content)]",
      )}
      data-floating-ai-avoid="true"
    >
      <Button
        type="button"
        variant="outline"
        onClick={onClear}
        disabled={submitting}
        className="w-full sm:w-auto"
      >
        Reset Form
      </Button>
      <Button
        type="button"
        onClick={onSave}
        disabled={submitting}
        className="w-full sm:w-auto"
        aria-keyshortcuts="Control+S Meta+S"
      >
        {submitting ? "Saving..." : "Save Collection"}
      </Button>
    </div>
  );
}
