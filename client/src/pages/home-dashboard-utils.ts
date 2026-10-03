import type { CollectionDashboardSummaryContract } from "@shared/api-contracts";

export const HOME_TIME_ZONE = "Asia/Kuala_Lumpur";
export const INITIAL_LEADER_COUNT = 6;
export const LEADER_COUNT_INCREMENT = 12;

export function getHomeBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOME_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year, month, day, daysInMonth,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    monthLabel: new Intl.DateTimeFormat("en-MY", { timeZone: HOME_TIME_ZONE, month: "long", year: "numeric" }).format(now),
    dateLabel: new Intl.DateTimeFormat("en-MY", { timeZone: HOME_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(now),
    daysRemaining: daysInMonth - day,
    greeting: hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening",
    nextMidnight: Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000,
  };
}

export function formatHomeAmount(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getHomeLeaderBreakdown(total: number, dashboard?: CollectionDashboardSummaryContract) {
  const leaders = dashboard?.canViewLeaderBreakdown === true
    ? dashboard.leaders.slice().sort((a, b) => b.totalAmount - a.totalAmount || a.name.localeCompare(b.name))
    : [];
  const subtotal = leaders.reduce((sum, leader) => sum + leader.totalAmount, 0);
  return {
    leaders,
    denominator: Math.max(total, subtotal),
    mismatch: Math.round(subtotal * 100) > Math.round(total * 100),
    unassignedAmount: dashboard?.canViewLeaderBreakdown === true
      ? dashboard.unassignedAmount : 0,
  };
}

/** Single-flight retries with cancellation and a token guard for transports that ignore abort. */
export function createHomeRequestGate() {
  let sequence = 0;
  let active: { sequence: number; controller: AbortController } | null = null;
  return {
    begin() {
      if (active) return null;
      active = { sequence: ++sequence, controller: new AbortController() };
      return active;
    },
    isCurrent(token: number) { return active?.sequence === token && !active.controller.signal.aborted; },
    finish(token: number) { if (active?.sequence === token) active = null; },
    cancel() { sequence += 1; active?.controller.abort(); active = null; },
  };
}
