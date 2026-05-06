import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import {
  captureDashboardElementCanvas,
  DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE,
  assertDashboardExportableElement,
} from "@/pages/dashboard/utils";

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

test("captureDashboardElementCanvas wraps html2canvas failures for UI feedback", async () => {
  const cause = new Error("tainted canvas");
  const failingCapture = (async () => {
    throw cause;
  }) as unknown as Parameters<typeof captureDashboardElementCanvas>[1];

  await assert.rejects(
    () =>
      captureDashboardElementCanvas(
        {} as HTMLElement,
        failingCapture,
        {} as Parameters<typeof captureDashboardElementCanvas>[2],
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE);
      assert.equal((error as Error & { cause?: unknown }).cause, cause);
      return true;
    },
  );
});
