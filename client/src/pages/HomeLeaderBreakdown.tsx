import { useMemo, useState } from "react";
import type { CollectionDashboardSummaryContract } from "@shared/api-contracts";
import { formatHomeAmount, getHomeLeaderBreakdown, INITIAL_LEADER_COUNT, LEADER_COUNT_INCREMENT } from "./home-dashboard-utils";

export function HomeLeaderBreakdown({ total, dashboard }: { total: number; dashboard: CollectionDashboardSummaryContract }) {
  const [filter, setFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_LEADER_COUNT);
  const breakdown = useMemo(() => getHomeLeaderBreakdown(total, dashboard), [total, dashboard]);
  const filtered = breakdown.leaders.map((leader, index) => ({ ...leader, rank: index + 1 }))
    .filter((leader) => leader.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const visible = filtered.slice(0, visibleCount);
  const percentage = (amount: number) => breakdown.denominator > 0
    ? Math.min(100, amount / breakdown.denominator * 100).toFixed(1) : "0.0";
  if (dashboard.canViewLeaderBreakdown !== true) return null;
  return <div className="home-leaders" data-testid="collection-leaders">
    <div className="home-leaders-heading"><div><h3>Collection by team leader</h3><p>Current active team assignments · {breakdown.leaders.length} leaders</p></div>
      <span className="home-count" aria-label={`${breakdown.leaders.length} leaders`}>{breakdown.leaders.length}</span>
    </div>
    {breakdown.mismatch ? <p className="home-mismatch" role="status">Leader totals exceed the Collection total. Percentages use the leader subtotal while the data is reconciled.</p> : null}
    {breakdown.leaders.length > INITIAL_LEADER_COUNT ? <input className="home-leader-filter" type="search" aria-label="Filter team leaders" placeholder="Filter team leaders…"
      value={filter} onChange={(event) => { setFilter(event.target.value); setVisibleCount(INITIAL_LEADER_COUNT); }} /> : null}
    <div className="home-leader-grid">
      {visible.map((leader) => <article key={leader.id} className="home-leader" data-testid="collection-leader">
        <div className="home-leader-heading"><span className="home-leader-rank">#{leader.rank}</span>
          <span className="home-leader-avatar" aria-hidden="true">{leader.name.slice(0, 2).toUpperCase()}</span><h4>{leader.name}</h4></div>
        <div className="home-leader-metric"><span>{percentage(leader.totalAmount)}% of {breakdown.mismatch ? "leader subtotal" : "Collection total"}</span><strong>{formatHomeAmount(leader.totalAmount)}</strong></div>
      </article>)}
      {!visible.length ? <p className="home-leader-empty">{filter ? "No leaders match your search." : "No active team leaders to show."}</p> : null}
    </div>
    {breakdown.unassignedAmount > 0 ? <div className="home-unassigned" data-testid="collection-unassigned">
      <div><strong>Unassigned</strong><span>Collections outside active team assignments</span></div>
      <strong>{formatHomeAmount(breakdown.unassignedAmount)}</strong>
    </div> : null}
    {breakdown.leaders.length > INITIAL_LEADER_COUNT ? <div className="home-leader-controls">
      <span>Showing {visible.length} of {filtered.length} leaders</span>
      {visibleCount > INITIAL_LEADER_COUNT ? <button className="home-small-button" type="button" onClick={() => setVisibleCount(INITIAL_LEADER_COUNT)}>Show fewer</button> : null}
      {visible.length < filtered.length ? <button className="home-small-button" type="button" onClick={() => setVisibleCount((count) => count + LEADER_COUNT_INCREMENT)}>Load more</button> : null}
    </div> : null}
  </div>;
}
