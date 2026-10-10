import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionRecordEditChangeSummary } from "../CollectionRecordEditChangeSummary";
import type { CollectionRecordEditChanges } from "../collection-record-edit-changes";

function render(changeReview: CollectionRecordEditChanges) {
  return renderToStaticMarkup(createElement(CollectionRecordEditChangeSummary, { changeReview }));
}

test("change review renders only supplied changes with explicit original and new labels", () => {
  const markup = render({
    hasChanges: true,
    changes: [
      { key: "amount", label: "Amount (RM)", before: "RM 100.00", after: "RM 125.50" },
      { key: "receipt-addition", label: "Receipt baharu", before: "—", after: "receipt-new.pdf" },
    ],
  });
  assert.match(markup, />2 perubahan<\/summary>/);
  assert.equal((markup.match(/<li /g) ?? []).length, 2);
  assert.equal((markup.match(/>Asal<\/dt>/g) ?? []).length, 2);
  assert.equal((markup.match(/>Baharu<\/dt>/g) ?? []).length, 2);
  for (const value of ["Amount (RM)", "RM 100.00", "RM 125.50", "Receipt baharu", "receipt-new.pdf"]) {
    assert.ok(markup.includes(value), value);
  }
  assert.doesNotMatch(markup, /Customer Name|IC Number|Account Number/);
});

test("change review uses a collapsed native keyboard disclosure without forced reopen or live PII announcements", () => {
  const markup = render({
    hasChanges: true,
    changes: [{ key: "name", label: "Customer Name", before: "Original", after: "Updated" }],
  });
  assert.match(markup, /^<details data-testid="edit-collection-change-summary"[^>]*><summary /);
  assert.doesNotMatch(markup, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.doesNotMatch(markup, /tabindex="-1"|aria-live=|role="(?:status|alert)"/);
  const source = readFileSync("client/src/pages/collection-records/CollectionRecordEditChangeSummary.tsx", "utf8");
  assert.doesNotMatch(source, /useEffect|useLayoutEffect|useState|onKeyDown|onClick|\bopen=|dangerouslySetInnerHTML/);
});

test("change review escapes text and wraps long identifiers and filenames without adding a scroll container", () => {
  const longValue = `${"long-identifier".repeat(30)}.pdf`;
  const markup = render({
    hasChanges: true,
    changes: [{ key: "receipt", label: "Receipt <script>", before: "<img src=x onerror=alert(1)>", after: longValue }],
  });
  assert.ok(markup.includes("Receipt &lt;script&gt;"));
  assert.ok(markup.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(markup.includes(longValue));
  assert.doesNotMatch(markup, /<script>|<img /);
  assert.equal((markup.match(/\[overflow-wrap:anywhere\]/g) ?? []).length, 3);
  assert.match(markup, /<details[^>]*min-w-0 max-w-full/);
  assert.match(markup, /<dl class="grid min-w-0 gap-3 sm:grid-cols-2"/);
  assert.doesNotMatch(markup, /overflow-(?:auto|scroll|x-|y-)|(?:^|\s)(?:h-|max-h-)|whitespace-nowrap/);
});

test("no changes omit the empty review disclosure", () => {
  assert.equal(render({ hasChanges: false, changes: [] }), "");
});
