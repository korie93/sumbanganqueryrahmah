import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/pages/settings/account-management/utils";
import type { DevMailOutboxPreview } from "@/pages/settings/types";

type LocalMailOutboxMobileListProps = {
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  emptyMessage: string;
  entries: DevMailOutboxPreview[];
  loading: boolean;
  onCopyPreviewLink: (previewUrl: string) => Promise<void>;
  onOpenDeleteDialog: (entry: DevMailOutboxPreview) => void;
  onOpenPreviewDialog: (entry: DevMailOutboxPreview) => void;
};

export function LocalMailOutboxMobileList({
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  emptyMessage,
  entries,
  loading,
  onCopyPreviewLink,
  onOpenDeleteDialog,
  onOpenPreviewDialog,
}: LocalMailOutboxMobileListProps) {
  if (loading || entries.length === 0) {
    return (
      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="break-words font-medium">{entry.to}</div>
              <div className="break-words text-sm text-muted-foreground">{entry.subject}</div>
            </div>
            <MobileActionMenu
              contentLabel="Email preview actions"
              items={[
                {
                  id: `copy-${entry.id}`,
                  label: "Copy Link",
                  onSelect: async () => onCopyPreviewLink(entry.previewUrl),
                },
                {
                  id: `delete-${entry.id}`,
                  label: deletingDevMailOutboxId === entry.id ? "Deleting..." : "Delete",
                  onSelect: () => onOpenDeleteDialog(entry),
                  disabled: deletingDevMailOutboxId === entry.id || clearingDevMailOutbox,
                  destructive: true,
                },
              ]}
            />
          </div>

          <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm">
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Created</dt>
              <dd>{formatDateTime(entry.createdAt)}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row" data-floating-ai-avoid="true">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenPreviewDialog(entry)}
            >
              Open
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                void onCopyPreviewLink(entry.previewUrl);
              }}
            >
              Copy Link
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
