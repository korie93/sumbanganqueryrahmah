import assert from "node:assert/strict";
import test from "node:test";
import { resolveDashboardExportBlockReason } from "@/pages/dashboard/export-guards";
import {
  captureDashboardElementCanvas,
  DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE,
  assertDashboardExportableElement,
  resolveDashboardExportPaintColor,
  resolveDashboardExportScale,
  sanitizeDashboardExportClone,
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

test("resolveDashboardExportScale caps oversized dashboard captures to protect memory", () => {
  assert.equal(resolveDashboardExportScale(1200, 1600), 2);

  const scale = resolveDashboardExportScale(3200, 6000);
  assert.ok(scale < 1);
  assert.ok(3200 * scale * 6000 * scale <= 12_100_000);
});

test("resolveDashboardExportPaintColor converts chart CSS variables for html2canvas", () => {
  assert.equal(resolveDashboardExportPaintColor("hsl(var(--chart-1))", false), "#2563eb");
  assert.equal(resolveDashboardExportPaintColor("hsl(var(--chart-1))", true), "#60a5fa");
  assert.equal(resolveDashboardExportPaintColor("url(#loginGradient)", false), null);
  assert.equal(resolveDashboardExportPaintColor("none", false), null);
});

class FakeDashboardExportElement {
  constructor(private readonly attributes: Record<string, string>) {}

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  readAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
}

test("sanitizeDashboardExportClone replaces SVG and inline CSS variable colors", () => {
  const svgLine = new FakeDashboardExportElement({
    fill: "none",
    stroke: "hsl(var(--chart-1))",
  });
  const svgStop = new FakeDashboardExportElement({
    "stop-color": "hsl(var(--chart-2))",
  });
  const styledNode = new FakeDashboardExportElement({
    style: "color: hsl(var(--primary)); border-color: hsl(var(--border) / 0.5);",
  });
  const root = {
    querySelectorAll: (selector: string) => {
      if (selector === "svg [fill], svg [stroke], svg [stop-color]") {
        return [svgLine, svgStop];
      }
      if (selector === "[style*='hsl(var']") {
        return [styledNode];
      }
      return [];
    },
  } as unknown as ParentNode;

  sanitizeDashboardExportClone(root, false);

  assert.equal(svgLine.readAttribute("fill"), "none");
  assert.equal(svgLine.readAttribute("stroke"), "#2563eb");
  assert.equal(svgStop.readAttribute("stop-color"), "#16a34a");
  assert.equal(styledNode.readAttribute("style"), "color: #2563eb; border-color: #e2e8f0;");
});
