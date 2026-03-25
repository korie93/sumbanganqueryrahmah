import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OperationalPageProps = {
  children: ReactNode;
  className?: string;
  width?: "wide" | "content";
};

type OperationalPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
};

type OperationalSectionCardProps = {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

type OperationalSummaryStripProps = {
  children: ReactNode;
  className?: string;
};

type OperationalMetricProps = {
  label: ReactNode;
  value: ReactNode;
  supporting?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
};

export function OperationalPage({
  children,
  className,
  width = "wide",
}: OperationalPageProps) {
  return (
    <div className="ops-page">
      <div
        className={cn(
          "ops-page-frame",
          width === "content" ? "max-w-7xl" : "max-w-[1680px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function OperationalPageHeader({
  title,
  description,
  eyebrow,
  actions,
  badge,
  className,
}: OperationalPageHeaderProps) {
  return (
    <Card className={cn("ops-header-card", className)}>
      <CardHeader className="gap-4 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="ops-eyebrow">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-2xl leading-tight tracking-tight sm:text-[1.75rem]">
                {title}
              </CardTitle>
              {description ? (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
    </Card>
  );
}

export function OperationalSectionCard({
  children,
  title,
  description,
  actions,
  badge,
  className,
  contentClassName,
  headerClassName,
}: OperationalSectionCardProps) {
  const hasHeader = Boolean(title || description || actions || badge);

  return (
    <Card className={cn("ops-section-card", className)}>
      {hasHeader ? (
        <CardHeader className={cn("gap-4 pb-3 lg:flex-row lg:items-start lg:justify-between", headerClassName)}>
          <div className="min-w-0 space-y-1">
            {title ? <CardTitle className="text-xl leading-tight">{title}</CardTitle> : null}
            {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {(badge || actions) ? (
            <div className="flex flex-wrap items-center gap-2">
              {badge}
              {actions}
            </div>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("space-y-4", hasHeader ? "pt-0" : "pt-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

export function OperationalSummaryStrip({
  children,
  className,
}: OperationalSummaryStripProps) {
  return <div className={cn("ops-summary-strip", className)}>{children}</div>;
}

export function OperationalMetric({
  label,
  value,
  supporting,
  tone = "default",
  className,
}: OperationalMetricProps) {
  const toneClassName =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-300"
          : "text-foreground";

  return (
    <div className={cn("ops-metric", className)}>
      <p className="ops-metric-label">{label}</p>
      <p className={cn("ops-metric-value", toneClassName)}>{value}</p>
      {supporting ? <p className="ops-metric-supporting">{supporting}</p> : null}
    </div>
  );
}
