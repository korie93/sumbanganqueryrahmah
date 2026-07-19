import assert from "node:assert/strict";
import test from "node:test";
import type { ClientErrorTelemetryPayload } from "../../../shared/client-error-telemetry";
import { ClientErrorTelemetryService } from "../client-error-telemetry.service";

function createPayload(
  overrides: Partial<ClientErrorTelemetryPayload> = {},
): ClientErrorTelemetryPayload {
  return {
    source: "route_render",
    errorName: "TypeError",
    fingerprint: "0123456789abcdef",
    path: "/customer/private-name?customer=private",
    pageType: "authenticated",
    releaseSha: "a".repeat(40),
    visibilityState: "visible",
    online: true,
    ts: "2026-07-19T08:30:00.000Z",
    ...overrides,
  };
}

test("client error telemetry logs only bounded privacy-safe metadata", () => {
  const warnings: Array<{ message: string; payload?: Record<string, unknown> }> = [];
  const service = new ClientErrorTelemetryService({
    logger: {
      warn(message, payload) {
        warnings.push(payload ? { message, payload } : { message });
      },
    },
  });

  service.record(createPayload());

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "Client runtime error reported");
  assert.deepEqual(warnings[0]?.payload, {
    event: "client_runtime_error_reported",
    source: "route_render",
    errorName: "TypeError",
    fingerprint: "0123456789abcdef",
    path: "/unknown",
    pageType: "authenticated",
    releaseSha: "a".repeat(40),
    visibilityState: "visible",
    online: true,
    capturedAt: "2026-07-19T08:30:00.000Z",
  });
  assert.equal("message" in (warnings[0]?.payload ?? {}), false);
  assert.equal("stack" in (warnings[0]?.payload ?? {}), false);
});
