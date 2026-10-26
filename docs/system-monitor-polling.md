# System Monitor recurring refresh

The prior timer invoked one poll without arming its successor. Initial load,
manual refresh or a visibility change could start another timer, but an idle
Monitor did not maintain its periodic refresh chain.

The active poll owner now schedules one next timer after its request and merged
pending refreshes have settled. Requests remain sequential. Manual refresh and
returning to a visible tab request detailed data through the existing queue;
queued callers do not schedule additional timers. Hiding a tab recalculates the
delay without overlapping the active request.

Intervals remain 5 seconds normally and 10 seconds in low-spec mode, or 15/30
seconds while hidden. These are delays after completion, not fixed-rate starts.
Existing detail cadence, 60-point history limits, permissions, API contracts and
data presentation are unchanged.

Unmount clears the timer, queued request and active controller. A lifecycle
generation and controller identity check prevent an old aborted owner from
clearing a newer request or scheduling work after StrictMode cleanup/replay.
Unexpected poll failures settle loading and retry on the ordinary delay instead
of leaving an unhandled rejection or permanently stopping refresh. Existing
network/permission outcomes still pass through the normal endpoint handling.

Regression coverage in `tests/visual/system-monitor-polling.spec.ts` uses the
production frontend with synthetic loopback responses and a controlled browser
clock. It checks repeated refreshes, slow in-flight requests, pending manual
refresh, visibility intervals and cleanup on SPA navigation. A baseline run with
the unchanged old hook can demonstrate the missing third periodic poll.
