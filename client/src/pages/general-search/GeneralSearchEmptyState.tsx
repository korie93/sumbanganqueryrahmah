import { useId } from "react";
import { GeneralSearchEmptyIllustration } from "@/pages/general-search/GeneralSearchEmptyIllustration";
import "@/pages/general-search/general-search-empty.css";

interface GeneralSearchEmptyStateProps {
  query: string;
  advancedMode: boolean;
}

export function GeneralSearchEmptyState({ query, advancedMode }: GeneralSearchEmptyStateProps) {
  const titleId = useId();

  return (
    <section className="sqr-empty" aria-labelledby={titleId} lang="ms" data-testid="general-search-empty">
      <p className="sr-only" role="status">Carian selesai. Tiada rekod ditemui. 0 padanan.</p>
      <div className="sqr-empty__main">
        <div className="sqr-empty__body">
          <div className="sqr-empty__meta">
            <span className="sqr-empty__eyebrow"><span className="sqr-empty__status-dot" aria-hidden="true" />KEPUTUSAN CARIAN</span>
            <span className="sqr-empty__count">0 padanan</span>
          </div>
          <div className="sqr-empty__heading">
            <span className="sqr-empty__icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.5 4.5M8.5 10.8h4.6" /></svg>
            </span>
            <h2 className="sqr-empty__title" id={titleId}>Tiada rekod ditemui</h2>
          </div>
          <p className="sqr-empty__lead">Tiada rekod yang sepadan dengan carian anda. Semak ejaan atau cuba kata kunci lain.</p>
          <div className="sqr-empty__query-row">
            <span>{advancedMode ? "Kriteria carian" : "Kata kunci"}</span>
            <output className="sqr-empty__query" title={query}>{query}</output>
          </div>
          <p className="sqr-empty__help">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            <span><strong>Petua:</strong> Cuba sebahagian nama, nombor IC atau nombor akaun.</span>
          </p>
        </div>
        <div className="sqr-empty__art" aria-hidden="true">
          <div className="sqr-empty__scene"><GeneralSearchEmptyIllustration /></div>
        </div>
      </div>
    </section>
  );
}
