import { Activity, CalendarDays, Clock3, Files, RefreshCw } from "lucide-react";
import type { NavigationEntry } from "@/app/navigation";
import { OperationalPage } from "@/components/layout/OperationalPage";
import { HomeNavigationCard, type HomeNavigationHandlers } from "./HomeNavigationCards";
import { HomeLeaderBreakdown } from "./HomeLeaderBreakdown";
import { buildHomeDashboardSections } from "./home-layout-utils";
import { formatHomeAmount, getHomeBusinessDate, HOME_TIME_ZONE } from "./home-dashboard-utils";
import { useHomeCollectionData, useHomeRecentActivity } from "./useHomeDashboardData";

type BusinessDate = ReturnType<typeof getHomeBusinessDate>;

function HomeCollectionOverview({ date }: { date: BusinessDate }) {
  const { state, retry } = useHomeCollectionData(date.year, date.month, date.key);
  const row = state.data?.summary.find((entry) => entry.month === date.month);
  const dashboard = state.data?.dashboard;
  const amount = row?.totalAmount ?? 0;
  return <section className="home-collection" data-testid="collection-overview" aria-labelledby="home-collection-title"
    aria-busy={state.status === "loading"} data-state={state.status}>
    <div className="home-collection-main">
      <div className="home-collection-metric">
        <div className="home-metric-heading">
          <div><span className="home-kicker">Collection overview</span><h2 id="home-collection-title">Total collected this month</h2></div>
          <span className="home-badge">{date.monthLabel}</span>
        </div>
        <div className="home-collection-state" aria-live="polite">
          {state.status === "loading" ? <div role="status" aria-label="Loading Collection summary">
            <div className="home-skeleton home-skeleton-amount" /><div className="home-skeleton home-skeleton-caption" />
            <span className="sr-only">Loading Collection summary</span>
          </div> : state.status === "error" ? <div className="home-error" role="alert">
            <strong>Collection summary is unavailable</strong><p>We could not load the latest totals. Please try again.</p>
            <button type="button" className="home-small-button" onClick={retry} aria-label="Retry Collection"><RefreshCw size={14} aria-hidden="true" />Retry</button>
          </div> : <>
            <div className="home-collection-amount" data-testid="collection-amount">{formatHomeAmount(amount)}</div>
            {state.status === "empty" ? <p className="home-muted">No Collection records for this month yet.</p> : null}
            <p className="home-muted">{dashboard?.scopeLabel || "Your authorized Collection scope"} · {(row?.totalRecords ?? 0).toLocaleString("en-MY")} records</p>
            {state.data.freshness && state.data.freshness.status !== "fresh"
              ? <p className="home-freshness">Collection updates are still being processed. Refresh to check the latest totals.</p> : null}
          </>}
        </div>
        <div className="home-metric-footer"><span>Malaysia business time</span>
          {state.status !== "error" ? <button type="button" className="home-text-button" onClick={retry}
            disabled={state.status === "loading"} aria-label="Refresh Collection summary"><RefreshCw size={12} aria-hidden="true" />Refresh</button> : null}
        </div>
      </div>
      <div className="home-month">
        <span className="home-module-icon"><CalendarDays size={18} aria-hidden="true" /></span>
        <p className="home-days"><strong>{date.daysRemaining}</strong><span>days left this month</span></p>
        <progress className="home-month-progress" max={date.daysInMonth} value={date.day} aria-label="Calendar month elapsed" />
        <p className="home-month-foot"><span>Day {date.day} of {date.daysInMonth}</span><span>Calendar days</span></p>
      </div>
      <div className="home-collection-aside" aria-hidden="true">
        <Files className="home-collection-symbol" strokeWidth={1} />
        <strong>A clear view of your collections</strong>
        <span>Review the current month and keep your daily work moving.</span>
      </div>
    </div>
    {(state.status === "ready" || state.status === "empty") && dashboard?.canViewLeaderBreakdown === true
      ? <HomeLeaderBreakdown total={amount} dashboard={dashboard} /> : null}
  </section>;
}

function HomeRecentActivity() {
  const state = useHomeRecentActivity();
  return <section className="home-panel home-activity" aria-labelledby="home-activity-title" data-testid="home-recent-activity">
    <div className="home-panel-heading"><div><h2 id="home-activity-title">Recent activity</h2><p>Latest sign-in activity</p></div><Clock3 size={16} aria-hidden="true" /></div>
    <div className="home-activity-list" aria-live="polite">
      {state.status === "loading" ? <p className="home-muted" role="status">Loading recent activity…</p> : null}
      {state.status === "error" ? <p className="home-muted">Recent activity is unavailable.</p> : null}
      {state.status === "empty" ? <p className="home-muted">No recent activity to show.</p> : null}
      {state.data?.map((entry, index) => {
        const timestamp = entry.loginTime || entry.lastActivityTime;
        const date = timestamp ? new Date(timestamp) : null;
        const validDate = date && Number.isFinite(date.getTime());
        // The production activity source supplies no route. These rows are static by design.
        return <div className="home-activity-row" key={entry.id || `${entry.username}:${index}`}>
          <span className="home-activity-icon"><Activity size={15} aria-hidden="true" /></span>
          <div className="home-activity-copy"><strong>{entry.username}</strong><span>{entry.status === "active" ? "Signed in" : entry.status === "failed" ? "Sign-in failed" : "Session ended"}</span></div>
          {validDate ? <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat("en-MY", { timeZone: HOME_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)}</time> : null}
        </div>;
      })}
    </div>
  </section>;
}

export function HomeDashboardLayout({ date, displayName, visibleItems, ...navigation }:
  HomeNavigationHandlers & { date: BusinessDate; displayName: string; visibleItems: NavigationEntry[] }) {
  const sections = buildHomeDashboardSections(visibleItems);
  return <OperationalPage width="content" className="home-dashboard-frame">
    <div className="home-dashboard" data-testid="home-dashboard">
      <header className="home-heading">
        <span className="home-kicker">Your workspace</span>
        <h1>{date.greeting}{displayName ? `, ${displayName}` : ""}.</h1>
        <p>{sections.canViewCollection
          ? "Your Collection overview, essential tools, and daily operations in one place."
          : "Your essential tools and daily operations in one place."}</p>
        <time dateTime={date.key}>{date.dateLabel}</time>
      </header>
      {sections.canViewCollection ? <HomeCollectionOverview key={date.key} date={date} /> : null}
      {sections.quickAccess.length ? <section className="home-section" aria-labelledby="home-quick-title">
        <div className="home-section-heading"><h2 id="home-quick-title">Quick access</h2><span>Your everyday tools</span></div>
        <div className="home-quick-grid">{sections.quickAccess.map((item) => <HomeNavigationCard key={item.id} item={item} primary {...navigation} />)}</div>
      </section> : null}
      <div className={`home-workspace-grid${sections.canViewRecentActivity ? " home-workspace-with-activity" : ""}`}>
        {sections.operational.length ? <section className="home-panel" aria-labelledby="home-modules-title">
          <div className="home-panel-heading"><div><h2 id="home-modules-title">Operational modules</h2><p>Tools available in your workspace.</p></div><span className="home-count">{sections.operational.length}</span></div>
          <div className="home-module-list">{sections.operational.map((item) => <HomeNavigationCard key={item.id} item={item} {...navigation} />)}</div>
        </section> : null}
        {sections.canViewRecentActivity ? <HomeRecentActivity /> : null}
      </div>
    </div>
  </OperationalPage>;
}
