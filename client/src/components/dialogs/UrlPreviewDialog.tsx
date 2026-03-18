import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[96vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-background/40">
          <iframe
            key={url}
            src={url}
            title={title}
            className="h-full w-full bg-white"
          />
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
