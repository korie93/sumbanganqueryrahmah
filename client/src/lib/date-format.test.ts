import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDateTimeDDMMYYYYMalaysia,
  formatOperationalDateTime,
  parseDateValue,
} from "@/lib/date-format";

test("parseDateValue treats database-style timestamps without timezone as UTC", () => {
  assert.equal(
    parseDateValue("2026-04-02 10:27:00")?.toISOString(),
    "2026-04-02T10:27:00.000Z",
  );
  assert.equal(
    parseDateValue("2026-04-02T10:27:00.123")?.toISOString(),
    "2026-04-02T10:27:00.123Z",
  );
});

test("parseDateValue keeps explicit UTC timestamps stable", () => {
  assert.equal(
    parseDateValue("2026-04-02T10:27:00.000Z")?.toISOString(),
    "2026-04-02T10:27:00.000Z",
  );
});

test("formatOperationalDateTime keeps Malaysia time correct for timezone-less DB timestamps", () => {
  assert.equal(
    formatOperationalDateTime("2026-04-02 10:27:00"),
    "02/04/2026, 6:27 PM",
  );
});

test("formatDateTimeDDMMYYYYMalaysia keeps timezone-less DB timestamps readable in 24-hour Malaysia time", () => {
  assert.equal(
    formatDateTimeDDMMYYYYMalaysia("2026-04-02 10:27:00"),
    "02/04/2026, 18:27",
  );
});
