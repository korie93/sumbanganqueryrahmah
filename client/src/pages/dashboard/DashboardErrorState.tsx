import { memo } from "react";

type DashboardErrorStateProps = {
  messages: string[];
};

function DashboardErrorStateImpl({ messages }: DashboardErrorStateProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
      aria-live="polite"
      data-testid="dashboard-error-state"
    >
      <p className="font-semibold">Sebahagian data dashboard gagal dimuat.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </section>
  );
}

export const DashboardErrorState = memo(DashboardErrorStateImpl);
