import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardAccountLink, setDashboardAccountLink } from "./collection-dashboard-account";
import { getCollectionMonthlySummary } from "./collection-reports";

test("Dashboard link API validates payloads, encodes account IDs and sends explicit unlink", async () => {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  let malformed = false;
  globalThis.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
    requests.push({ url: String(url), method: options?.method, body: options?.body });
    return new Response(JSON.stringify(malformed ? { ok: true, link: { isActive: "yes" } }
      : { ok: true, link: null, nicknames: [{ id: "nickname", nickname: "STAFF" }] }),
    { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.equal((await getDashboardAccountLink("account/one", new AbortController().signal)).nicknames[0]?.nickname, "STAFF");
    assert.equal(requests[0]?.url, "/api/collection/dashboard-accounts/account%2Fone");
    await setDashboardAccountLink("account", null);
    assert.equal(requests[1]?.method, "PUT");
    assert.equal(requests[1]?.body, '{"nicknameId":null}');
    malformed = true;
    await assert.rejects(setDashboardAccountLink("account", "nickname"), /API contract mismatch/);
  } finally { globalThis.fetch = original; }
});

test("Dashboard unlinked scope survives response parsing and stays distinguishable from genuine zero", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true, year: 2026, summary: [], dashboard: {
      month: 10, scopeStatus: "link_required", scopeLabel: "Your Collection nickname",
      canViewLeaderBreakdown: false, leaders: [], unassignedAmount: 0,
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const data = await getCollectionMonthlySummary({ year: 2026, dashboardMonth: 10 });
    assert.equal(data.dashboard?.scopeStatus, "link_required");
    assert.deepEqual(data.summary, []);
  } finally { globalThis.fetch = original; }
});
