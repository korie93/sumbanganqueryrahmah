export function CollectionNicknameSummaryIdleState() {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Pilih staff nickname dan julat tarikh, kemudian tekan Apply untuk lihat ringkasan kutipan.
    </div>
  );
}

export function CollectionNicknameSummaryLoadingState() {
  return (
    <div
      className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading nickname summary...
    </div>
  );
}

export function CollectionNicknameSummaryErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-5"
      role="alert"
    >
      <p className="text-sm font-semibold text-destructive">Nickname summary could not be loaded</p>
      <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}
