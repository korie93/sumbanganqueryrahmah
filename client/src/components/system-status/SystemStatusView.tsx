import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Clock3, RefreshCw, SearchX, ServerOff, WifiOff, Wrench } from "lucide-react";
import { SYSTEM_STATUS_CONTENT, type SystemStatusKind } from "@shared/system-status";

type StatusAction = { label: string; onClick?: () => void; href?: string; kind?: "navigate" | "retry" };
export type SystemStatusViewProps = {
  state: SystemStatusKind;
  primary: StatusAction;
  secondary?: StatusAction | undefined;
  busy?: boolean;
  disabled?: boolean;
  feedback?: string;
  children?: ReactNode;
  logoSrc?: string;
  staticRecovery?: boolean;
};
const icons = { "404": SearchX, "502": ServerOff, "503": ServerOff, "504": Clock3,
  maintenance: Wrench, offline: WifiOff, restored: CheckCircle2 };

/** Shared accessible status layout; also rendered at build time for independent Nginx fallbacks. */
export function SystemStatusView({ state, primary, secondary, busy = false, disabled = false,
  feedback = "", children, logoSrc = "/brand/sqr-logo-minimal.svg", staticRecovery = false,
}: SystemStatusViewProps) {
  const content = SYSTEM_STATUS_CONTENT[state];
  const Icon = icons[state];
  const ActionIcon = primary.kind === "navigate" ? ArrowRight : RefreshCw;
  const secondaryAction = secondary ?? (staticRecovery ? { label: "Kembali ke Log Masuk", href: "/login" } : undefined);
  return (
    <main id="main-content" tabIndex={-1} className="sqr-status" data-testid="system-status-page"
      data-state={state} data-tone={content.tone}
      data-recovery-copy={staticRecovery ? JSON.stringify(SYSTEM_STATUS_CONTENT) : undefined}>
      <div className="sqr-status__frame">
        <header className="sqr-status__header">
          <div className="sqr-status__brand">
            <img src={logoSrc} width="44" height="44" alt="" aria-hidden="true" />
            <div><p className="sqr-status__wordmark">SQR</p><p className="sqr-status__brand-name">Sumbangan Query Rahmah</p></div>
          </div>
          <span className="sqr-status__eyebrow">Pusat status</span>
        </header>
        <div className="sqr-status__workspace">
          <section className="sqr-status__primary" aria-labelledby="system-status-title">
            <div className="sqr-status__badge">
              <span data-status-icon="initial"><Icon aria-hidden="true" focusable="false" /></span>
              {staticRecovery ? <>
                <span data-status-icon="offline" hidden><WifiOff aria-hidden="true" focusable="false" /></span>
                <span data-status-icon="restored" hidden><CheckCircle2 aria-hidden="true" focusable="false" /></span>
                {state !== "maintenance" ? <span data-status-icon="maintenance" hidden><Wrench aria-hidden="true" focusable="false" /></span> : null}
              </> : null}
              <span data-status-label>{content.label}</span>
            </div>
            <h1 id="system-status-title" data-status-title>{content.title}</h1>
            <p className="sqr-status__description" data-status-description>{content.description}</p>
            {children ? <div className="sqr-status__details">{children}</div> : null}
            <div className="sqr-status__actions">
              {primary.href ? <a href={primary.href} className="sqr-status__button sqr-status__button--primary" data-status-primary>
                <span>{primary.label}</span><ArrowRight aria-hidden="true" focusable="false" />
              </a> : <button type="button" onClick={primary.onClick} disabled={disabled || busy} aria-busy={busy}
                className="sqr-status__button sqr-status__button--primary" data-status-primary>
                <span>{busy ? "Menyemak sambungan…" : primary.label}</span><ActionIcon aria-hidden="true" focusable="false" />
              </button>}
              {secondaryAction ? secondaryAction.href ? <a href={secondaryAction.href}
                hidden={staticRecovery && state !== "maintenance"} data-status-secondary
                className="sqr-status__button sqr-status__button--secondary">{secondaryAction.label}</a>
                : <button type="button" onClick={secondaryAction.onClick} className="sqr-status__button sqr-status__button--secondary">{secondaryAction.label}</button> : null}
            </div>
            <p className="sqr-status__feedback" role="status" aria-live="polite" aria-atomic="true" data-status-feedback>{feedback}</p>
          </section>
          <aside className="sqr-status__guidance" aria-labelledby="status-guidance-title">
            <p className="sqr-status__eyebrow">Langkah seterusnya</p>
            <h2 id="status-guidance-title" data-status-guidance>{content.guidance}</h2>
            <ol>{content.steps.map((step, index) => <li key={step}><span className="sqr-status__step" aria-hidden="true">0{index + 1}</span><p data-status-step={index}>{step}</p></li>)}</ol>
            <p className="sqr-status__note" data-status-note>{content.note}</p>
          </aside>
        </div>
        <footer className="sqr-status__footer"><span>Platform operasi dalaman</span><span data-status-code>{content.code ? `Kod: ${content.code}` : "Status sambungan"}</span></footer>
      </div>
    </main>
  );
}
