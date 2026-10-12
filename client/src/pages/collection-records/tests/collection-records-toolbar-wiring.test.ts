import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../useCollectionRecordsController.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("controller.ts", source, ts.ScriptTarget.Latest, true);

function toolbarMemo() {
  let declaration: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "toolbar") declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const initializer = declaration?.initializer;
  assert.ok(initializer && ts.isCallExpression(initializer));
  assert.equal(initializer.expression.getText(parsed), "useMemo");
  return initializer;
}

test("records toolbar keeps every field and action explicitly wired without an identity adapter", () => {
  const memo = toolbarMemo();
  assert.equal(memo.typeArguments?.[0]?.getText(parsed), "CollectionRecordsToolbarViewModel");
  const factory = memo.arguments[0];
  assert.ok(factory && ts.isArrowFunction(factory));
  assert.ok(ts.isParenthesizedExpression(factory.body));
  const fields = factory.body.expression;
  assert.ok(ts.isObjectLiteralExpression(fields));
  const bindings = Object.fromEntries(fields.properties.map((property) => {
    assert.ok(ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property));
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    return [property.name.getText(parsed), value.getText(parsed).replace(/\s+/g, "")];
  }));
  assert.deepEqual(bindings, {
    summary: "summary",
    loadingRecords: "loadingRecords",
    viewAllLoading: "viewAllLoading",
    exportingExcel: "actions.toolbar.exportingExcel",
    exportingPdf: "actions.toolbar.exportingPdf",
    canPurgeOldRecords: "canPurgeOldRecords",
    purgeSummaryLoading: "actions.toolbar.purgeSummaryLoading",
    purgingOldRecords: "actions.toolbar.purgingOldRecords",
    purgeSummary: "actions.toolbar.purgeSummary",
    pagedStart: "pagedStart",
    pagedEnd: "pagedEnd",
    totalRecords: "totalRecords",
    tablePage: "page",
    totalPages: "totalPages",
    tablePageSize: "pageSize",
    hasNextPage: "hasNextPage",
    hasPreviousPage: "hasPreviousPage",
    onOpenViewAll: "()=>voidhandleOpenViewAll()",
    onOpenPurgeDialog: "()=>voidactions.toolbar.onOpenPurgeDialog()",
    onExportExcel: "()=>voidactions.toolbar.onExportExcel()",
    onExportPdf: "()=>voidactions.toolbar.onExportPdf()",
    onTablePageSizeChange: "handlePageSizeChange",
    onPrevPage: "handlePrevPage",
    onNextPage: "handleNextPage",
  });
  assert.doesNotMatch(source, /buildCollectionRecordsToolbarViewModel/);
});

test("records toolbar memo retains all pagination, permission, loading and action dependencies", () => {
  const dependencies = toolbarMemo().arguments[1];
  assert.ok(dependencies && ts.isArrayLiteralExpression(dependencies));
  assert.deepEqual(dependencies.elements.map((element) => element.getText(parsed)), [
    "actions.toolbar", "canPurgeOldRecords", "handleNextPage", "handleOpenViewAll",
    "handlePageSizeChange", "handlePrevPage", "hasNextPage", "hasPreviousPage",
    "loadingRecords", "page", "pageSize", "pagedEnd", "pagedStart", "totalPages",
    "totalRecords", "summary", "viewAllLoading",
  ]);
});
