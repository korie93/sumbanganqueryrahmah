import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";

type UrlPreviewDialogProps = {
  open: boolean;
  title: string;
  description: string;
  url: string;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
};

export function UrlPreviewDialog({
  open,
  title,
  description,
  url,
  onOpenChange,
  onClose,
}: UrlPreviewDialogProps) {
  const isMobile = useIsMobile();

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0"
            : "flex h-[88vh] w-[96vw] max-w-6xl flex-col overflow-hidden"
        }
      >
        <DialogHeader className={isMobile ? "border-b border-border/60 px-4 py-4 pr-12 text-left" : ""}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className={`min-h-0 flex-1 overflow-hidden bg-background/40 ${isMobile ? "" : "rounded-md border border-border/60"}`}>
          <iframe
            key={url}
            src={url}
            title={title}
            className="h-full w-full bg-white"
          />
        </div>

        <DialogFooter
          className={isMobile
            ? "border-t border-border/60 bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85"
            : "flex flex-row items-center justify-end gap-2"
          }
          style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" } : undefined}
        >
          <Button type="button" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              Open in New Tab
            </a>
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
