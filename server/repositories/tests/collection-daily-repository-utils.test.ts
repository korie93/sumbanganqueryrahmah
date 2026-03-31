import assert from "node:assert/strict";
import test from "node:test";
import {
  listCollectionDailyCalendar,
  upsertCollectionDailyCalendarDays,
} from "../collection-daily-repository-utils";
import { collectBoundValues, collectSqlText, createSequenceExecutor } from "./sql-test-utils";

test("upsertCollectionDailyCalendarDays batches multiple days into one upsert query", async () => {
  const { executor, queries } = createSequenceExecutor([
    { rows: [] },
    {
      rows: [
        {
          id: "calendar-1",
          year: 2026,
          month: 3,
          day: 1,
          is_working_day: true,
          is_holiday: false,
          holiday_name: null,
          created_by: "admin.user",
          updated_by: "admin.user",
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "calendar-2",
          year: 2026,
          month: 3,
          day: 2,
          is_working_day: false,
          is_holiday: true,
          holiday_name: "Special Day",
          created_by: "admin.user",
          updated_by: "admin.user",
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
  ]);

  const calendar = await upsertCollectionDailyCalendarDays(
    {
      year: 2026,
      month: 3,
      actor: "admin.user",
      days: [
        { day: 1, isWorkingDay: true, isHoliday: false, holidayName: null },
        { day: 2, isWorkingDay: false, isHoliday: true, holidayName: "Special Day" },
      ],
    },
    executor,
  );

  assert.equal(calendar.length, 2);
  assert.equal(queries.length, 2);

  const upsertSql = collectSqlText(queries[0]);
  assert.match(upsertSql, /INSERT INTO public\.collection_daily_calendar/i);
  assert.match(upsertSql, /ON CONFLICT \(year, month, day\)/i);
  assert.match(upsertSql, /\)\s*,\s*\(/i);

  const boundValues = collectBoundValues(queries[0]);
  assert.ok(boundValues.includes(1));
  assert.ok(boundValues.includes(2));
  assert.ok(boundValues.includes("Special Day"));
  assert.equal(boundValues.filter((value) => value === "admin.user").length >= 4, true);

  const listSql = collectSqlText(queries[1]);
  assert.match(listSql, /SELECT\s+id,\s+year,\s+month,\s+day/i);
  assert.match(listSql, /ORDER BY day ASC/i);
});

test("listCollectionDailyCalendar maps rows using the provided executor", async () => {
  const { executor, queries } = createSequenceExecutor([
    {
      rows: [
        {
          id: "calendar-7",
          year: 2026,
          month: 4,
          day: 7,
          is_working_day: true,
          is_holiday: false,
          holiday_name: null,
          created_by: "superuser",
          updated_by: "superuser",
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
      ],
    },
  ]);

  const rows = await listCollectionDailyCalendar(
    {
      year: 2026,
      month: 4,
    },
    executor,
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.day, 7);
  assert.equal(queries.length, 1);
  assert.match(collectSqlText(queries[0]), /FROM public\.collection_daily_calendar/i);
});
