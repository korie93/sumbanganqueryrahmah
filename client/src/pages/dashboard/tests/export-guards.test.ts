import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDashboardExportBlockReason,
  resolveDashboardExportStatusMessage,
} from "@/pages/dashboard/export-guards";
import {
  buildDashboardPdfSummaryReport,
  captureDashboardElementCanvas,
  collectDashboardFallbackPdfLines,
  DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE,
  assertDashboardExportableElement,
  resolveDashboardCanvasPdfSlices,
  resolveDashboardExportPaintColor,
  resolveDashboardExportScale,
  sanitizeDashboardExportClone,
  withDashboardTrustedHtmlDocumentWrite,
  writeDashboardFallbackPdf,
} from "@/pages/dashboard/utils";

type TrustedTypesPolicyLike = {
  createHTML: (input: string) => unknown;
};

type DashboardTrustedTypesGlobal = typeof globalThis & {
  Document?: unknown;
  HTMLIFrameElement?: unknown;
  __sqrTrustedTypesDefaultPolicy?: TrustedTypesPolicyLike | null;
  __sqrTrustedTypesPolicy?: TrustedTypesPolicyLike | null;
  trustedTypes?: {
    createPolicy: (
      name: string,
      rules: { createHTML: (input: string) => string },
    ) => TrustedTypesPolicyLike;
  };
};

function createFakeTextNode(textContent: string) {
  return {
    nodeType: 3,
    textContent,
  } as unknown as Node;
}

function createFakeElementNode(
  tagName: string,
  childNodes: readonly Node[] = [],
  excluded = false,
) {
  return {
    nodeType: 1,
    tagName,
    childNodes,
    matches() {
      return excluded;
    },
    closest() {
      return excluded ? {} : null;
    },
  } as unknown as Element;
}

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

test("resolveDashboardExportStatusMessage explains export readiness and busy states", () => {
  assert.equal(
    resolveDashboardExportStatusMessage({
      exportBlockReason: null,
      exportingPdf: false,
      refreshing: false,
    }),
    "PDF sedia untuk dijana dengan ringkasan dashboard semasa.",
  );

  assert.equal(
    resolveDashboardExportStatusMessage({
      exportBlockReason: "busy",
      exportingPdf: true,
      refreshing: false,
    }),
    "Sedang jana PDF. Jangan tutup halaman sehingga muat turun selesai.",
  );

  assert.equal(
    resolveDashboardExportStatusMessage({
      exportBlockReason: "busy",
      exportingPdf: false,
      refreshing: true,
    }),
    "Refresh sedang berjalan. Export PDF akan aktif selepas data stabil.",
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

test("resolveDashboardCanvasPdfSlices keeps tall dashboard captures readable across pages", () => {
  const pageWidth = 297;
  const pageHeight = 210;
  const slices = resolveDashboardCanvasPdfSlices(1200, 2600, pageWidth, pageHeight);

  assert.ok(slices.length > 1);
  assert.equal(slices[0]?.sourceY, 0);

  const lastSlice = slices[slices.length - 1]!;
  assert.equal(lastSlice.sourceY + lastSlice.sourceHeight, 2600);

  for (const slice of slices) {
    assert.equal(slice.imageX, 14);
    assert.equal(slice.imageY, 43);
    assert.ok(slice.imageWidth > 0);
    assert.ok(slice.imageHeight > 0);
    assert.ok(slice.imageY + slice.imageHeight <= pageHeight - 8);
  }
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

test("collectDashboardFallbackPdfLines extracts safe visible dashboard text only", () => {
  const hiddenSection = createFakeElementNode("div", [createFakeTextNode("Hidden value")], true);
  const root = createFakeElementNode("div", [
    createFakeTextNode(" Dashboard Analytics "),
    createFakeTextNode(" Dashboard Analytics "),
    createFakeElementNode("section", [
      createFakeTextNode("Total Users"),
      createFakeTextNode("10"),
    ]),
    hiddenSection,
    createFakeElementNode("script", [createFakeTextNode("alert(1)")]),
  ]);

  assert.deepEqual(collectDashboardFallbackPdfLines(root), [
    "Dashboard Analytics",
    "Total Users",
    "10",
  ]);
});

test("writeDashboardFallbackPdf writes dashboard text when canvas capture is unavailable", () => {
  const textCalls: string[] = [];
  const pdf = {
    internal: {
      pageSize: {
        getWidth: () => 297,
        getHeight: () => 210,
      },
    },
    addPage() {
      // Single-page test fixture.
    },
    line() {
      // Styling call.
    },
    rect() {
      // Styling call.
    },
    setDrawColor() {
      // Styling call.
    },
    setFillColor() {
      // Styling call.
    },
    setFont() {
      // Styling call.
    },
    setFontSize() {
      // Styling call.
    },
    setLineWidth() {
      // Styling call.
    },
    setTextColor() {
      // Styling call.
    },
    splitTextToSize(line: string) {
      return [line];
    },
    text(value: string | string[]) {
      textCalls.push(Array.isArray(value) ? value.join(" ") : value);
    },
  } as unknown as Parameters<typeof writeDashboardFallbackPdf>[0];

  writeDashboardFallbackPdf(pdf, ["Dashboard Analytics", "Total Users", "10"], "dark");

  assert.ok(textCalls.includes("Dashboard Login Report"));
  assert.ok(textCalls.includes("Readable dashboard summary"));
  assert.ok(textCalls.includes("Dashboard Analytics"));
  assert.ok(textCalls.includes("Total Users"));
  assert.ok(textCalls.includes("10"));
});

test("buildDashboardPdfSummaryReport creates a structured operator summary without IP details", () => {
  const report = buildDashboardPdfSummaryReport(
    {
      peakHours: [{ hour: 9, count: 12 }],
      recentLoginActivities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.1.50",
          lastActivityTime: "2026-05-06T06:50:00Z",
          loginTime: "2026-05-06T06:00:00Z",
          logoutReason: "IDLE_TIMEOUT",
          logoutTime: "2026-05-06T07:00:00Z",
          role: "admin",
          status: "ended",
          username: "operator.one",
        },
      ],
      summary: {
        activeSessions: 2,
        bannedUsers: 0,
        loginsToday: 8,
        loginFailures24h: 1,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 12,
      },
      topUsers: [
        { lastLogin: "2026-05-06T05:00:00Z", loginCount: 6, role: "admin", username: "operator.one" },
      ],
      trends: [
        { date: "2026-05-05", logins: 5, logouts: 3 },
        { date: "2026-05-06", logins: 8, logouts: 4 },
      ],
    },
    new Date("2026-05-06T07:00:00Z"),
  );

  assert.equal(report.title, "Dashboard Login Operational Summary");
  assert.ok(report.sections.some((section) => section.title === "Executive Summary"));
  assert.ok(report.sections.some((section) => section.title === "Login Health Score"));
  assert.ok(report.sections.some((section) => section.title === "KPI Snapshot"));
  assert.ok(report.sections.some((section) => section.title === "Action Queue"));
  assert.ok(report.sections.some((section) => section.rows.some((row) => row.includes("Score: 76/100 (Watch)."))));
  assert.ok(report.sections.some((section) => section.rows.some((row) => row.includes("Score deduction: -12 Failed login pressure: 1."))));
  assert.ok(report.sections.some((section) => section.rows.some((row) => row.includes("Score deduction: -12 Login trend check: 8 latest day."))));
  assert.ok(report.sections.some((section) => section.rows.some((row) => row.includes("Most active account"))));
  assert.doesNotMatch(JSON.stringify(report), /10\.42\.1\.50/);
});

test("writeDashboardFallbackPdf renders structured dashboard report sections", () => {
  const textCalls: string[] = [];
  const pdf = {
    internal: {
      pageSize: {
        getWidth: () => 297,
        getHeight: () => 210,
      },
    },
    addPage() {
      // Single-page test fixture.
    },
    line() {
      // Styling call.
    },
    rect() {
      // Styling call.
    },
    setDrawColor() {
      // Styling call.
    },
    setFillColor() {
      // Styling call.
    },
    setFont() {
      // Styling call.
    },
    setFontSize() {
      // Styling call.
    },
    setLineWidth() {
      // Styling call.
    },
    setTextColor() {
      // Styling call.
    },
    splitTextToSize(line: string) {
      return [line];
    },
    text(value: string | string[]) {
      textCalls.push(Array.isArray(value) ? value.join(" ") : value);
    },
  } as unknown as Parameters<typeof writeDashboardFallbackPdf>[0];
  const report = buildDashboardPdfSummaryReport(
    {
      recentLoginActivities: [],
      summary: {
        activeSessions: 0,
        bannedUsers: 0,
        loginsToday: 0,
        loginFailures24h: 0,
        totalDataRows: 0,
        totalImports: 0,
        totalUsers: 0,
      },
      trends: [],
    },
    new Date("2026-05-06T07:00:00Z"),
  );

  writeDashboardFallbackPdf(pdf, report, "light");

  assert.ok(textCalls.includes("Operational PDF summary"));
  assert.ok(textCalls.includes("Executive Summary"));
  assert.ok(textCalls.includes("Login Health Score"));
  assert.ok(textCalls.includes("KPI Snapshot"));
  assert.ok(textCalls.includes("Action Queue"));
  assert.ok(textCalls.some((text) => text.includes("Score: 100/100 (Healthy).")));
  assert.ok(textCalls.some((text) => text.includes("No immediate review items")));
});

test("withDashboardTrustedHtmlDocumentWrite supplies TrustedHTML to html2canvas document writes", async () => {
  const trustedTypesGlobal = globalThis as unknown as DashboardTrustedTypesGlobal;
  const previousDocument = trustedTypesGlobal.Document;
  const previousPolicy = trustedTypesGlobal.__sqrTrustedTypesPolicy;
  const writeCalls: unknown[][] = [];

  class FakeDocument {
    write(...parts: unknown[]) {
      writeCalls.push(parts);
    }
  }

  try {
    Reflect.set(trustedTypesGlobal, "Document", FakeDocument);
    trustedTypesGlobal.__sqrTrustedTypesPolicy = {
      createHTML(input) {
        return { trustedHtml: input };
      },
    };

    const fakeDocument = new FakeDocument();
    const originalWrite = FakeDocument.prototype.write;

    await withDashboardTrustedHtmlDocumentWrite(async () => {
      fakeDocument.write("<!doctype html>", "<html></html>");
    });

    assert.equal(FakeDocument.prototype.write, originalWrite);
    assert.equal((writeCalls[0]?.[0] as { trustedHtml?: string }).trustedHtml, "<!doctype html>");
    assert.equal((writeCalls[0]?.[1] as { trustedHtml?: string }).trustedHtml, "<html></html>");
  } finally {
    if (previousDocument === undefined) {
      Reflect.deleteProperty(trustedTypesGlobal, "Document");
    } else {
      Reflect.set(trustedTypesGlobal, "Document", previousDocument);
    }

    if (previousPolicy === undefined) {
      delete trustedTypesGlobal.__sqrTrustedTypesPolicy;
    } else {
      trustedTypesGlobal.__sqrTrustedTypesPolicy = previousPolicy;
    }
  }
});

test("withDashboardTrustedHtmlDocumentWrite initializes Trusted Types inside html2canvas iframes", async () => {
  const trustedTypesGlobal = globalThis as unknown as DashboardTrustedTypesGlobal;
  const previousDocument = trustedTypesGlobal.Document;
  const previousIframe = trustedTypesGlobal.HTMLIFrameElement;
  const previousDefaultPolicy = trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy;
  const frameWriteCalls: unknown[][] = [];
  const createdPolicyNames: string[] = [];

  class FakeTopDocument {
    write() {
      // Top document writes are not part of this iframe regression case.
    }
  }

  class FakeFrameDocument {
    write(...parts: unknown[]) {
      frameWriteCalls.push(parts);
    }
  }

  const fakeFrameWindow = {
    Document: FakeFrameDocument,
    trustedTypes: {
      createPolicy(name: string, rules: { createHTML: (input: string) => string }) {
        createdPolicyNames.push(name);
        return {
          createHTML(input: string) {
            return { trustedHtml: rules.createHTML(input) };
          },
        };
      },
    },
  };

  class FakeIframeElement {
    get contentWindow() {
      return fakeFrameWindow;
    }
  }

  try {
    Reflect.set(trustedTypesGlobal, "Document", FakeTopDocument);
    Reflect.set(trustedTypesGlobal, "HTMLIFrameElement", FakeIframeElement);

    const originalContentWindowDescriptor = Object.getOwnPropertyDescriptor(
      FakeIframeElement.prototype,
      "contentWindow",
    );
    const originalFrameWrite = FakeFrameDocument.prototype.write;

    await withDashboardTrustedHtmlDocumentWrite(async () => {
      const iframe = new FakeIframeElement();
      const frameWindow = iframe.contentWindow;
      const frameDocument = new frameWindow.Document();
      frameDocument.write("<!doctype html><html></html>");
    });

    assert.equal(FakeFrameDocument.prototype.write, originalFrameWrite);
    assert.deepEqual(createdPolicyNames, ["default"]);
    assert.equal(
      (frameWriteCalls[0]?.[0] as { trustedHtml?: string }).trustedHtml,
      "<!doctype html><html></html>",
    );
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(FakeIframeElement.prototype, "contentWindow"),
      originalContentWindowDescriptor,
    );
  } finally {
    if (previousDocument === undefined) {
      Reflect.deleteProperty(trustedTypesGlobal, "Document");
    } else {
      Reflect.set(trustedTypesGlobal, "Document", previousDocument);
    }

    if (previousIframe === undefined) {
      Reflect.deleteProperty(trustedTypesGlobal, "HTMLIFrameElement");
    } else {
      Reflect.set(trustedTypesGlobal, "HTMLIFrameElement", previousIframe);
    }

    if (previousDefaultPolicy === undefined) {
      delete trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy;
    } else {
      trustedTypesGlobal.__sqrTrustedTypesDefaultPolicy = previousDefaultPolicy;
    }
  }
});
