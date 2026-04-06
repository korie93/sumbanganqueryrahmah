import assert from "node:assert/strict";
import test from "node:test";

import { buildMonitorPaginationQuery } from "@/lib/api/monitor-query-utils";

test("buildMonitorPaginationQuery clamps to positive whole-number params only", () => {
  assert.equal(buildMonitorPaginationQuery({ page: 2.9, pageSize: 5.4 }), "?page=2&pageSize=5");
  assert.equal(buildMonitorPaginationQuery({ page: 0, pageSize: -1 }), "");
  assert.equal(buildMonitorPaginationQuery(undefined), "");
});
