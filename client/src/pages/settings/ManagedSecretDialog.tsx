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
import { logClientError } from "@/lib/client-logger";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const normalizedValue = String(value || "").trim();
  const hasValue = Boolean(normalizedValue);
  const safeOpenUrl = resolveSafeHttpUrl(normalizedValue);

  const handleCopyClick = () => {
    if (!normalizedValue) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast({
        title: "Copy unavailable",
        description: "Clipboard access is not available in this browser context.",
        variant: "destructive",
      });
      return;
    }

    void navigator.clipboard.writeText(normalizedValue)
      .then(() => {
        toast({
          title: "Copied",
          description: "The managed secret has been copied to your clipboard.",
        });
      })
      .catch((error: unknown) => {
        logClientError("Failed to copy managed secret", error, {
          source: "client.log",
          component: "ManagedSecretDialog",
        });
        toast({
          title: "Copy failed",
          description: "The value could not be copied right now. Please try again.",
          variant: "destructive",
        });
      });
  };

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
              onClick={handleCopyClick}
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
