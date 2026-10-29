import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function hasAccessibleTruncatedElement(source: string): boolean {
  const ast = ts.createSourceFile("contract.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const className = attributes.find((attribute) => attribute.name.getText(ast) === "className")?.initializer;
      const expression = className && ts.isJsxExpression(className) ? className.expression : className;
      const staticClasses = expression && ts.isStringLiteralLike(expression) ? expression.text
        : expression && ts.isTemplateExpression(expression)
          ? [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)].join("\0") : "";
      const hasTextAttribute = (name: string) => attributes.some((attribute) => {
        if (attribute.name.getText(ast) !== name || !attribute.initializer) return false;
        const value = attribute.initializer;
        if (ts.isStringLiteral(value)) return value.text.trim().length > 0;
        if (!ts.isJsxExpression(value) || !value.expression) return false;
        const text = value.expression;
        return text.kind !== ts.SyntaxKind.NullKeyword && text.kind !== ts.SyntaxKind.FalseKeyword
          && text.kind !== ts.SyntaxKind.TrueKeyword && !ts.isNumericLiteral(text)
          && !(ts.isIdentifier(text) && text.text === "undefined")
          && (!ts.isStringLiteralLike(text) || text.text.trim().length > 0);
      });
      if (staticClasses.split(/\s+/).includes("truncate") && hasTextAttribute("title") && hasTextAttribute("aria-label")) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

test("truncated text contract accepts literal and template class lists with reordered text attributes", () => {
  const sources = [
    '<div className="truncate text-sm" title={text} aria-label={text} />',
    '<div aria-label={text} className={`text-sm ${pinned ? styles.pinnedCell : ""} truncate`} title={text} />',
    '<div className={"truncate text-sm"} aria-label="Full name" title="Full name" />',
    '<div className={`truncate`} title={cellText} aria-label={cellText}>{cellText}</div>',
  ];
  for (const source of sources) assert.equal(hasAccessibleTruncatedElement(source), true, source);
});

test("truncated text contract rejects missing or unrelated text attributes", () => {
  const sources = [
    '<div className="truncate" title={text} />',
    '<div className={`truncate ${extra}`} aria-label={text} />',
    '<div className={`truncate${suffix}`} title={text} aria-label={text} />',
    '<div className={`${prefix}truncate`} title={text} aria-label={text} />',
    '<><div className="truncate" title={text} /><span aria-label={text} /></>',
    '<div className="not-truncate" title={text} aria-label={text} />',
    '<div className="truncate" title="" aria-label={text} />',
    '<div className="truncate" title={text} aria-label={" "} />',
    '<div className="truncate" title={text} aria-label />',
    '<div className="truncate" title={null} aria-label={text} />',
    '<div className="truncate" title={text} aria-label={undefined} />',
    '<div className="truncate" title={false} aria-label={text} />',
    '// <div className="truncate" title={text} aria-label={text} />',
  ];
  for (const source of sources) assert.equal(hasAccessibleTruncatedElement(source), false, source);
});

test("data-heavy truncated rows expose title and aria-label text", () => {
  const sourcePaths = [
    "../pages/activity/ActivityMobileLogsList.tsx",
    "../pages/activity/ActivityDesktopLogRow.tsx",
    "../pages/viewer/ViewerVirtualizedRow.tsx",
    "../pages/viewer/ViewerVirtualizedTable.tsx",
    "../pages/backup-restore/BackupListItem.tsx",
    "../pages/audit-logs/AuditLogRecordCard.tsx",
    "../pages/import/BulkImportPanel.tsx",
    "../pages/collection/CollectionReceiptPanel.tsx",
    "../pages/collection/CollectionDailyDayDetailsDialogParts.tsx",
    "../pages/dashboard/DashboardUserInsightsGrid.tsx",
    "../pages/dashboard/DashboardChartsGridParts.tsx",
    "../components/NavbarParts.tsx",
  ];

  for (const sourcePath of sourcePaths) {
    const source = readClientSource(sourcePath);

    assert.equal(hasAccessibleTruncatedElement(source), true,
      `${sourcePath} must expose title and aria-label on the same truncated element`);
  }
});

test("collection day metrics render complete non-empty values without truncation", () => {
  const source = readClientSource("../pages/collection/CollectionDailyDayDetailsDialogParts.tsx");

  assert.match(source, /function formatMetricValueLabel\(value: string \| number\)/);
  assert.match(source, /return normalized \|\| "No value";/);
  assert.match(source, /const valueLabel = formatMetricValueLabel\(value\);/);
  assert.match(source, /<dd className="collection-day-metric-value">\{valueLabel\}<\/dd>/);
  const css = readClientSource("../pages/collection/CollectionDailyDayDetailsDialog.css");
  assert.match(css, /\.collection-day-metric-value\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /\.collection-day-metric-value\s*\{[^}]*(?:text-overflow:\s*ellipsis|white-space:\s*nowrap)/);
  assert.doesNotMatch(source, /title=\{String\(value\)\}/);
  assert.doesNotMatch(source, /aria-label=\{String\(value\)\}/);
});

test("viewer truncated cells use the shared non-empty value formatter", () => {
  const source = readClientSource("../pages/viewer/ViewerVirtualizedRow.tsx");

  assert.match(source, /const cellText = formatViewerCellValue\(row\[header\]\);/);
  assert.match(source, /title=\{cellText\}/);
  assert.match(source, /aria-label=\{cellText\}/);
  assert.doesNotMatch(source, /String\(row\[header\] \?\? "-"\)/);
});
