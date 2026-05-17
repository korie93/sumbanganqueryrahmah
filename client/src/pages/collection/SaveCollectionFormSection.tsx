import type { ReactNode } from "react";

type SaveCollectionFormSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function SaveCollectionFormSection({
  title,
  description,
  children,
}: SaveCollectionFormSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
