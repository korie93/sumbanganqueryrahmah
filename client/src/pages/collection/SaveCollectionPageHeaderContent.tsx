type SaveCollectionPageHeaderContentProps = {
  draftRestoreNotice?: { hadPendingReceipts: boolean } | null;
  isMobile: boolean;
  restoreNoticeLabel: string | null;
};

export function SaveCollectionPageHeaderContent({
  draftRestoreNotice,
  isMobile,
  restoreNoticeLabel,
}: SaveCollectionPageHeaderContentProps) {
  return (
    <>
      <div className="relative space-y-2">
        {isMobile ? (
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Collection
          </p>
        ) : null}
        <CardTitleText />
        {isMobile ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Save one collection record at a time with a cleaner mobile flow for customer details, payment
            info, and receipt upload.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Draft auto-saves in this browser session.</span>
        <span>
          Use <span className="font-medium text-foreground">Ctrl/Cmd+S</span> to save quickly.
        </span>
      </div>
      {draftRestoreNotice ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Draft restored.</span>
          {restoreNoticeLabel ? ` Last saved ${restoreNoticeLabel}.` : null}
          {draftRestoreNotice.hadPendingReceipts
            ? " Pending receipt files need to be uploaded again before saving."
            : null}
        </div>
      ) : null}
    </>
  );
}

function CardTitleText() {
  return <h2 className="text-xl font-semibold tracking-tight">Simpan Collection Individual</h2>;
}
