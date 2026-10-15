import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveCollectionFormSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
  icon?: LucideIcon | undefined;
  accent?: "customer" | "payment" | "receipt" | undefined;
  className?: string | undefined;
  contentClassName?: string | undefined;
  actions?: ReactNode;
};

export function SaveCollectionFormSection({
  title,
  description,
  children,
  icon: Icon,
  accent,
  className,
  contentClassName,
  actions,
}: SaveCollectionFormSectionProps) {
  return (
    <section className={cn("save-collection-section", className)} data-accent={accent}>
      <header className="save-collection-section-header">
        {Icon ? (
          <span className="save-collection-section-icon" aria-hidden="true">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="save-collection-section-heading min-w-0 space-y-1">
          <h3 className="text-base font-medium text-foreground">{title}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="save-collection-section-actions">{actions}</div> : null}
      </header>
      <div className={cn("save-collection-section-content grid gap-4", contentClassName)}>{children}</div>
    </section>
  );
}
