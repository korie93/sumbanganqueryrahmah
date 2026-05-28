import { buildReadableAuditDetails } from "@/pages/audit-logs/audit-log-readable-details";

interface AuditLogReadableDetailsProps {
  details: string;
  showRaw?: boolean;
}

export function AuditLogReadableDetails({ details, showRaw = false }: AuditLogReadableDetailsProps) {
  const readable = buildReadableAuditDetails(details);

  if (!readable.text) {
    return (
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        No extra details recorded.
      </p>
    );
  }

  if (!readable.isJson || readable.items.length === 0) {
    return (
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
        {readable.text}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        {readable.items.map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-border/60 bg-background/75 px-3 py-2"
          >
            <dt className="text-2xs font-semibold uppercase tracking-label-lg text-muted-foreground">
              {item.label}
            </dt>
            <dd className="mt-1 break-words text-sm font-medium leading-relaxed text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {showRaw ? (
        <details className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            View original technical data
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground">
            {details}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
