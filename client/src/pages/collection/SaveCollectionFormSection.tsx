import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SaveCollectionFormSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
  className?: string | undefined;
  contentClassName?: string | undefined;
};

export function SaveCollectionFormSection({
  title,
  description,
  children,
  className,
  contentClassName,
}: SaveCollectionFormSectionProps) {
  return (
    <section className={cn("space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4", className)}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className={cn("grid gap-4", contentClassName)}>{children}</div>
    </section>
  );
}
