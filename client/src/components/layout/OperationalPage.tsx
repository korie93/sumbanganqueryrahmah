import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OperationalPageProps = {
  children: ReactNode;
  className?: string | undefined;
  width?: "wide" | "content" | "form" | "report";
};

const pageWidthClasses = {
  wide: "max-w-[1680px]",
  content: "max-w-7xl",
  form: "max-w-[1120px]",
  report: "max-w-[1480px]",
} as const;

type OperationalPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode | undefined;
  eyebrow?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  badge?: ReactNode | undefined;
  className?: string | undefined;
};

type OperationalSectionCardProps = {
  children: ReactNode;
  title?: ReactNode | undefined;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  badge?: ReactNode | undefined;
  className?: string | undefined;
  contentClassName?: string | undefined;
  headerClassName?: string | undefined;
};

type OperationalSummaryStripProps = {
  children: ReactNode;
  className?: string | undefined;
};

type OperationalMetricProps = {
  label: ReactNode;
  value: ReactNode;
  supporting?: ReactNode | undefined;
  tone?: "default" | "success" | "warning" | "danger" | undefined;
  className?: string | undefined;
};

/**
 * Renders the shared operational page component used across SQR screens.
 */
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
          pageWidthClasses[width],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Renders the operational page header region for grouped SQR content.
 */
export function OperationalPageHeader({
  title,
  description,
  eyebrow,
  actions,
  badge,
  className,
}: OperationalPageHeaderProps) {
  return (
    <header className={cn("ops-header-card", className)}>
      <div className="ops-page-heading">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="ops-eyebrow">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="ops-page-title">
                {title}
              </h1>
              {description ? (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {badge ? <div className="min-w-0 max-w-full">{badge}</div> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Renders the shared operational section card component used across SQR screens.
 */
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
        <CardHeader
          className={cn(
            "gap-4 pb-3 xl:flex-row xl:items-start xl:justify-between",
            headerClassName,
          )}
        >
          <div className="min-w-0 space-y-1">
            {title ? (
              <CardTitle role="heading" aria-level={2} className="text-lg leading-tight">
                {title}
              </CardTitle>
            ) : null}
            {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {(badge || actions) ? (
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
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

/**
 * Renders the shared operational summary strip component used across SQR screens.
 */
export function OperationalSummaryStrip({
  children,
  className,
}: OperationalSummaryStripProps) {
  return <div className={cn("ops-summary-strip", className)}>{children}</div>;
}

/**
 * Renders the shared operational metric component used across SQR screens.
 */
export function OperationalMetric({
  label,
  value,
  supporting,
  tone = "default",
  className,
}: OperationalMetricProps) {
  const toneClassName =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className={cn("ops-metric", className)}>
      <p className="ops-metric-label">{label}</p>
      <p className={cn("ops-metric-value", toneClassName)}>{value}</p>
      {supporting ? <p className="ops-metric-supporting">{supporting}</p> : null}
    </div>
  );
}
