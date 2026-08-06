import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { GeneralSearchRecordField } from "@/pages/general-search/general-search-record-dialog-utils";

type GeneralSearchRecordSummaryProps = {
  fields: GeneralSearchRecordField[];
};

type GeneralSearchRecordSectionProps = {
  fields: GeneralSearchRecordField[];
  icon: LucideIcon;
  id: string;
  title: string;
};

type GeneralSearchCollapsibleRecordSectionProps = GeneralSearchRecordSectionProps & {
  defaultOpen?: boolean | undefined;
};

function GeneralSearchRecordFieldList({ fields }: { fields: GeneralSearchRecordField[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
      {fields.map((field) => (
        <div
          className="min-w-0 border-t border-border/60 py-2.5 sm:grid sm:grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3"
          key={field.header}
        >
          <dt className="min-w-0 break-words text-xs font-medium text-muted-foreground">
            {field.header}
          </dt>
          <dd className="mt-1 min-w-0 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere] sm:mt-0">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function GeneralSearchRecordSectionHeading({
  count,
  icon: Icon,
  id,
  title,
}: {
  count: number;
  icon: LucideIcon;
  id: string;
  title: string;
}) {
  return (
    <div className="mb-2 flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <h3 className="min-w-0 text-sm font-semibold text-foreground" id={id}>
        {title}
      </h3>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

export function GeneralSearchRecordSummary({ fields }: GeneralSearchRecordSummaryProps) {
  if (fields.length === 0) return null;

  return (
    <section aria-labelledby="general-search-record-summary-heading">
      <h3
        className="mb-2 text-xs font-semibold uppercase tracking-label-md text-muted-foreground"
        id="general-search-record-summary-heading"
      >
        Ringkasan utama
      </h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {fields.map((field) => (
          <div
            className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5"
            key={field.header}
          >
            <dt className="break-words text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
              {field.header}
            </dt>
            <dd className="mt-1 min-w-0 break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GeneralSearchRecordSection({
  fields,
  icon,
  id,
  title,
}: GeneralSearchRecordSectionProps) {
  if (fields.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <GeneralSearchRecordSectionHeading count={fields.length} icon={icon} id={id} title={title} />
      <GeneralSearchRecordFieldList fields={fields} />
    </section>
  );
}

export function GeneralSearchCollapsibleRecordSection({
  defaultOpen = false,
  fields,
  icon: Icon,
  id,
  title,
}: GeneralSearchCollapsibleRecordSectionProps) {
  if (fields.length === 0) return null;

  return (
    <details
      className="group rounded-lg border border-border/60 bg-muted/15 px-3"
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0" id={id}>{title}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {fields.length}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-1" role="region" aria-labelledby={id}>
        <GeneralSearchRecordFieldList fields={fields} />
      </div>
    </details>
  );
}
