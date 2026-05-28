import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID,
  openCollectionMonthlyComparisonReportWindow,
  sanitizeCollectionMonthlyComparisonReportHtml,
} from "@/pages/collection-summary/collection-monthly-report-window";

type CapturedListener = EventListener | null;

function createFakeReportWindow() {
  let parsedHtml = "";
  let documentLang = "";
  let focused = false;
  let printCallCount = 0;
  let animationFrame: FrameRequestCallback | null = null;
  let clickListener: CapturedListener = null;
  let beforeUnloadListener: CapturedListener = null;
  const importedNodes: unknown[] = [];
  const headNodes: unknown[] = [];
  const bodyNodes: unknown[] = [];

  const printButton = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "click" && typeof listener === "function") {
        clickListener = listener;
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "click" && clickListener === listener) {
        clickListener = null;
      }
    },
  };

  const sourceDocument = {
    documentElement: {
      getAttribute(name: string) {
        return name === "lang" ? "en" : null;
      },
    },
    head: {
      childNodes: [{ nodeName: "TITLE" }] as unknown as NodeListOf<ChildNode>,
    },
    body: {
      childNodes: [{ nodeName: "MAIN" }] as unknown as NodeListOf<ChildNode>,
    },
    title: "Sanitized monthly report",
  };

  const targetDocument = {
    documentElement: {
      setAttribute(name: string, value: string) {
        if (name === "lang") {
          documentLang = value;
        }
      },
    },
    head: {
      replaceChildren(...nodes: unknown[]) {
        headNodes.splice(0, headNodes.length, ...nodes);
      },
    },
    body: {
      replaceChildren(...nodes: unknown[]) {
        bodyNodes.splice(0, bodyNodes.length, ...nodes);
      },
    },
    title: "",
    importNode(node: Node) {
      const imported = { importedNode: node };
      importedNodes.push(imported);
      return imported as unknown as Node;
    },
    getElementById(id: string) {
      return id === COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID
        ? printButton as unknown as HTMLElement
        : null;
    },
    write() {
      throw new Error("document.write must not be called");
    },
  };

  class FakeDOMParser {
    parseFromString(html: string) {
      parsedHtml = html;
      return sourceDocument as unknown as Document;
    }
  }

  const reportWindow = {
    document: targetDocument,
    DOMParser: FakeDOMParser,
    opener: {},
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "beforeunload" && typeof listener === "function") {
        beforeUnloadListener = listener;
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === "beforeunload" && beforeUnloadListener === listener) {
        beforeUnloadListener = null;
      }
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      animationFrame = callback;
      return 7;
    },
    cancelAnimationFrame(id: number) {
      assert.equal(id, 7);
      animationFrame = null;
    },
    focus() {
      focused = true;
    },
    print() {
      printCallCount += 1;
    },
  } as unknown as Window;

  return {
    reportWindow,
    get animationFrame() {
      return animationFrame;
    },
    get beforeUnloadListener() {
      return beforeUnloadListener;
    },
    get bodyNodes() {
      return bodyNodes;
    },
    get clickListener() {
      return clickListener;
    },
    get documentLang() {
      return documentLang;
    },
    get focused() {
      return focused;
    },
    get headNodes() {
      return headNodes;
    },
    get importedNodes() {
      return importedNodes;
    },
    get parsedHtml() {
      return parsedHtml;
    },
    get printCallCount() {
      return printCallCount;
    },
  };
}

test("sanitizeCollectionMonthlyComparisonReportHtml strips executable report markup", () => {
  const sanitized = sanitizeCollectionMonthlyComparisonReportHtml(`
    <main><button onclick="alert(1)">Print</button></main>
    <img src=x onerror="alert(1)">
    <script>alert(1)</script>
    <iframe src="https://evil.example"></iframe>
  `);

  assert.equal(sanitized.includes("<script"), false);
  assert.equal(sanitized.includes("<iframe"), false);
  assert.equal(sanitized.includes("onclick"), false);
  assert.equal(sanitized.includes("onerror"), false);
  assert.equal(sanitized.includes(" src="), false);
});

test("sanitizeCollectionMonthlyComparisonReportHtml preserves legitimate report content", () => {
  const sanitized = sanitizeCollectionMonthlyComparisonReportHtml(`
    <!doctype html>
    <html lang="en">
      <head><title>Report</title><style>body { color: #0f172a; }</style></head>
      <body>
        <main><h1>Monthly Collection Comparison</h1><table><tbody><tr><td>RM1,000.00</td></tr></tbody></table></main>
        <button id="${COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID}" class="print-button" type="button">Print</button>
      </body>
    </html>
  `);

  assert.match(sanitized, /Monthly Collection Comparison/);
  assert.match(sanitized, /RM1,000\.00/);
  assert.match(sanitized, new RegExp(COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID));
});

test("openCollectionMonthlyComparisonReportWindow sanitizes and injects without document.write", () => {
  const fake = createFakeReportWindow();
  let openUrl: string | URL | undefined;
  let openTarget: string | undefined;
  let openFeatures: string | undefined;

  const result = openCollectionMonthlyComparisonReportWindow(
    `<html lang="en"><head><title>Unsafe</title></head><body><button id="${COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID}" onclick="alert(1)">Print</button><script>alert(1)</script></body></html>`,
    {
      openWindow: (url, target, features) => {
        openUrl = url;
        openTarget = target;
        openFeatures = features;
        return fake.reportWindow;
      },
    },
  );

  assert.equal(result.opened, true);
  assert.equal(openUrl, "");
  assert.equal(openTarget, "_blank");
  assert.match(openFeatures ?? "", /noopener/);
  assert.match(openFeatures ?? "", /noreferrer/);
  assert.equal(fake.parsedHtml.includes("<script"), false);
  assert.equal(fake.parsedHtml.includes("onclick"), false);
  assert.equal(fake.reportWindow.opener, null);
  assert.equal(fake.documentLang, "en");
  assert.equal(fake.headNodes.length, 1);
  assert.equal(fake.bodyNodes.length, 1);
  assert.equal(fake.importedNodes.length, 2);
  assert.equal(fake.focused, true);
  assert.equal(typeof fake.clickListener, "function");

  fake.clickListener?.(new Event("click"));
  assert.equal(fake.printCallCount, 1);

  fake.animationFrame?.(0);
  assert.equal(fake.printCallCount, 2);

  fake.beforeUnloadListener?.(new Event("beforeunload"));
  assert.equal(fake.clickListener, null);
});

test("openCollectionMonthlyComparisonReportWindow returns sanitized HTML for popup-blocked fallback", () => {
  let fallbackHtml = "";
  const result = openCollectionMonthlyComparisonReportWindow(
    `<main>Safe</main><script>alert(1)</script>`,
    {
      onPopupBlocked: (sanitizedHtml) => {
        fallbackHtml = sanitizedHtml;
      },
      openWindow: () => null,
    },
  );

  assert.equal(result.opened, false);
  assert.equal(fallbackHtml.includes("<script"), false);
  assert.equal(result.sanitizedHtml, fallbackHtml);
});
