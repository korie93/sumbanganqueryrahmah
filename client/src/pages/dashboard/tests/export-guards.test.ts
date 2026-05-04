import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import { assertDashboardExportableElement } from "@/pages/dashboard/utils";

test("resolveDashboardExportBlockReason blocks exports while dashboard work is already active", () => {
  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: true,
      refreshing: false,
    }),
    "busy",
  );

  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: false,
      refreshing: true,
    }),
    "busy",
  );
});

test("resolveDashboardExportBlockReason allows export when dashboard is idle", () => {
  assert.equal(
    resolveDashboardExportBlockReason({
      exportingPdf: false,
      refreshing: false,
    }),
    null,
  );
});

test("assertDashboardExportableElement requires the whitelisted dashboard export root", () => {
  assert.doesNotThrow(() => {
    assertDashboardExportableElement({
      getAttribute: (name: string) => (name === "data-dashboard-export-root" ? "true" : null),
      closest: () => null,
    } as unknown as HTMLElement);
  });

  assert.throws(
    () => {
      assertDashboardExportableElement({
        getAttribute: () => null,
        closest: () => null,
      } as unknown as HTMLElement);
    },
    /approved dashboard report region/i,
  );

  assert.throws(
    () => {
      assertDashboardExportableElement({
        getAttribute: (name: string) => (name === "data-dashboard-export-root" ? "true" : null),
        closest: () => ({}) as Element,
      } as unknown as HTMLElement);
    },
    /hidden or marked sensitive/i,
  );
});
