import type { ReactNode } from "react";

type SaveCollectionFormSectionProps = {
  children: ReactNode;
  description: string;
  title: string;
};

export function SaveCollectionFormSection({
  children,
  description,
  title,
}: SaveCollectionFormSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
