import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveSafeHttpUrl } from "@/lib/safe-url";

export interface ManagedSecretDialogProps {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  value?: string | undefined;
}

export function ManagedSecretDialog({
  description,
  onOpenChange,
  open,
  title,
  value,
}: ManagedSecretDialogProps) {
  const normalizedValue = String(value || "").trim();
  const hasValue = Boolean(normalizedValue);
  const safeOpenUrl = resolveSafeHttpUrl(normalizedValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {hasValue ? (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-sm break-all">
            {value}
          </div>
        ) : null}
        <DialogFooter>
          {safeOpenUrl ? (
            <Button
              variant="outline"
              onClick={() => {
                window.open(safeOpenUrl, "_blank", "noopener,noreferrer");
              }}
            >
              Open
            </Button>
          ) : null}
          {hasValue ? (
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(normalizedValue);
              }}
            >
              Copy
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
