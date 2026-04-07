export function CollectionNicknameSummaryIdleState() {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Pilih staff nickname dan julat tarikh, kemudian tekan Apply untuk lihat ringkasan kutipan.
    </div>
  );
}

export function CollectionNicknameSummaryLoadingState() {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
      Loading nickname summary...
    </div>
  );
}
