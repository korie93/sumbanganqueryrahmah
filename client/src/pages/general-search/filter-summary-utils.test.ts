import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchFilterSummaries } from "@/pages/general-search/utils";

test("buildSearchFilterSummaries ignores incomplete filters and keeps operator labels readable", () => {
  assert.deepEqual(
    buildSearchFilterSummaries([
      { id: "1", field: "Full Name", operator: "contains", value: " Ali " },
      { id: "2", field: "IC", operator: "equals", value: "" },
      { id: "3", field: "Account No", operator: "isNotEmpty", value: "" },
    ]),
    ["Full Name • Contains • Ali", "Account No • Is not empty"],
  );
});

test("buildSearchFilterSummaries shortens very long values for compact mobile chips", () => {
  assert.deepEqual(
    buildSearchFilterSummaries([
      {
        id: "1",
        field: "Address",
        operator: "contains",
        value: "Lot 123 Jalan Bukit Bintang Kuala Lumpur Malaysia",
      },
    ]),
    ["Address • Contains • Lot 123 Jalan Bukit Binta..."],
  );
});
