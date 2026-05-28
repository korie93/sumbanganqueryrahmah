import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";

export const COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID =
  "collection-monthly-comparison-report-print";

const COLLECTION_MONTHLY_REPORT_WINDOW_FEATURES =
  "noopener,noreferrer,width=1120,height=820";

const COLLECTION_MONTHLY_REPORT_TITLE = "SQR Monthly Comparison Report";

const COLLECTION_MONTHLY_REPORT_ALLOWED_TAGS = [
  "html",
  "head",
  "body",
  "meta",
  "title",
  "style",
  "main",
  "header",
  "section",
  "div",
  "p",
  "h1",
  "h2",
  "strong",
  "ul",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "button",
  "svg",
  "rect",
  "line",
  "text",
] as const;

const COLLECTION_MONTHLY_REPORT_ALLOWED_ATTR = [
  "aria-label",
  "charset",
  "class",
  "colspan",
  "content",
  "fill",
  "font-size",
  "height",
  "id",
  "lang",
  "media",
  "name",
  "role",
  "rowspan",
  "rx",
  "stroke",
  "stroke-dasharray",
  "stroke-width",
  "style",
  "text-anchor",
  "type",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
] as const;

const COLLECTION_MONTHLY_REPORT_DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_ATTR: [...COLLECTION_MONTHLY_REPORT_ALLOWED_ATTR],
  ALLOWED_TAGS: [...COLLECTION_MONTHLY_REPORT_ALLOWED_TAGS],
  FORBID_ATTR: ["action", "href", "onerror", "onclick", "onload", "src"],
  FORBID_TAGS: ["base", "embed", "form", "iframe", "input", "link", "object", "script"],
  RETURN_TRUSTED_TYPE: false,
  WHOLE_DOCUMENT: true,
};

type ReportWindowOpen = (
  url?: string | URL,
  target?: string,
  features?: string,
) => Window | null;

type OpenCollectionMonthlyComparisonReportOptions = {
  autoPrint?: boolean;
  onPopupBlocked?: (sanitizedHtml: string) => void;
  openWindow?: ReportWindowOpen;
};

type OpenCollectionMonthlyComparisonReportResult =
  | { opened: true; sanitizedHtml: string }
  | { opened: false; sanitizedHtml: string };

function fallbackSanitizeCollectionMonthlyComparisonReportHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:base|embed|form|iframe|input|link|object)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/\s+(?:action|href|src)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
}

export function sanitizeCollectionMonthlyComparisonReportHtml(reportHtml: string): string {
  const normalizedHtml = String(reportHtml || "");
  if (DOMPurify.isSupported && typeof DOMPurify.sanitize === "function") {
    const sanitized = DOMPurify.sanitize(
      normalizedHtml,
      COLLECTION_MONTHLY_REPORT_DOMPURIFY_CONFIG,
    );
    return typeof sanitized === "string" ? sanitized : String(sanitized);
  }

  return fallbackSanitizeCollectionMonthlyComparisonReportHtml(normalizedHtml);
}

function cloneChildNodes(targetDocument: Document, nodes: NodeListOf<ChildNode> | ChildNode[]) {
  return Array.from(nodes).map((node) => targetDocument.importNode(node, true));
}

function injectSanitizedReportHtml(reportWindow: Window, sanitizedHtml: string): void {
  const Parser = (reportWindow as Window & { DOMParser?: typeof DOMParser }).DOMParser ?? DOMParser;
  const parsedDocument = new Parser().parseFromString(
    sanitizedHtml,
    "text/html",
  );
  const targetDocument = reportWindow.document;
  const reportLang = parsedDocument.documentElement.getAttribute("lang") || "en";

  targetDocument.documentElement.setAttribute("lang", reportLang);
  targetDocument.head.replaceChildren(
    ...cloneChildNodes(targetDocument, parsedDocument.head.childNodes),
  );
  targetDocument.body.replaceChildren(
    ...cloneChildNodes(targetDocument, parsedDocument.body.childNodes),
  );
  targetDocument.title = parsedDocument.title || COLLECTION_MONTHLY_REPORT_TITLE;
}

function attachCollectionMonthlyComparisonReportEvents(
  reportWindow: Window,
  options: { autoPrint: boolean },
): void {
  const printButton = reportWindow.document.getElementById(
    COLLECTION_MONTHLY_REPORT_PRINT_BUTTON_ID,
  );
  const handlePrint = () => {
    reportWindow.print();
  };
  let animationFrameId: number | null = null;

  printButton?.addEventListener("click", handlePrint);

  const cleanup = () => {
    printButton?.removeEventListener("click", handlePrint);
    if (animationFrameId !== null) {
      reportWindow.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    reportWindow.removeEventListener("beforeunload", cleanup);
  };

  reportWindow.addEventListener("beforeunload", cleanup, { once: true });

  if (options.autoPrint) {
    animationFrameId = reportWindow.requestAnimationFrame(() => {
      animationFrameId = null;
      reportWindow.print();
    });
  }
}

export function openCollectionMonthlyComparisonReportWindow(
  reportHtml: string,
  options: OpenCollectionMonthlyComparisonReportOptions = {},
): OpenCollectionMonthlyComparisonReportResult {
  const sanitizedHtml = sanitizeCollectionMonthlyComparisonReportHtml(reportHtml);
  const openWindow = options.openWindow ?? window.open.bind(window);
  const reportWindow = openWindow("", "_blank", COLLECTION_MONTHLY_REPORT_WINDOW_FEATURES);

  if (!reportWindow) {
    options.onPopupBlocked?.(sanitizedHtml);
    return { opened: false, sanitizedHtml };
  }

  reportWindow.opener = null;
  injectSanitizedReportHtml(reportWindow, sanitizedHtml);
  attachCollectionMonthlyComparisonReportEvents(reportWindow, {
    autoPrint: options.autoPrint ?? true,
  });
  reportWindow.focus();

  return { opened: true, sanitizedHtml };
}
