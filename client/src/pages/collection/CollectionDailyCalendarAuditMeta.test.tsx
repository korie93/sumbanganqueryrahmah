import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewDay } from "@/lib/api";
import { CollectionDailyCalendarAuditMeta } from "@/pages/collection/CollectionDailyCalendarAuditMeta";

const baseDay: CollectionDailyOverviewDay = {
  day: 1,
  date: "2026-05-01",
  amount: 0,
  target: 0,
  calendarStatus: "WORKING",
  leaveType: null,
  note: null,
  isWorkingDay: true,
  isHoliday: false,
  holidayName: null,
  customerCount: 0,
  status: "red",
};

test("CollectionDailyCalendarAuditMeta shows updater metadata when available", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarAuditMeta, {
      day: {
        ...baseDay,
        updatedBy: "superuser",
        updatedAt: "2026-05-01T02:30:00.000Z",
      },
    }),
  );

  assert.match(markup, /Dikemaskini oleh superuser/);
});

test("CollectionDailyCalendarAuditMeta explains default status without metadata", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyCalendarAuditMeta, { day: baseDay }),
  );

  assert.match(markup, /Status default/);
});

