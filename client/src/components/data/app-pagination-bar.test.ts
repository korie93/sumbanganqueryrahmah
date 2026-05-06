import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppPaginationBar, buildAppPaginationSummary } from "@/components/data/AppPaginationBar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("buildAppPaginationSummary reports visible pagination ranges", () => {
  assert.equal(
    buildAppPaginationSummary({
      itemLabel: "records",
      loading: false,
      page: 2,
      pageSize: 25,
      totalItems: 90,
      totalPages: 4,
    }),
    "Showing 26-50 of 90 records",
  );
});

test("buildAppPaginationSummary switches to loading copy while pagination is refreshing", () => {
  assert.equal(
    buildAppPaginationSummary({
      itemLabel: "audit logs",
      loading: true,
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    }),
    "Updating audit logs...",
  );
});

test("AppPaginationBar gives the page-size select an explicit accessible label", () => {
  const source = readFileSync(path.join(__dirname, "AppPaginationBar.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(AppPaginationBar, {
      disabled: true,
      loading: true,
      page: 1,
      totalPages: 1,
      pageSize: 20,
      totalItems: 0,
      itemLabel: "managed accounts",
      onPageChange: () => undefined,
      onPageSizeChange: () => undefined,
    }),
  );

  assert.match(source, /const pageSizeLabel = `Page size for \$\{itemLabel\}`;/);
  assert.match(markup, /aria-label="Page size for managed accounts"/);
});
