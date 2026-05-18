import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteCollectionDailyCalendarDay,
  listCollectionDailyCalendarAudit,
  listCollectionDailyCalendar,
  listCollectionDailyPaidCustomers,
  upsertCollectionDailyCalendarDays,
} from "../collection-daily-repository-utils";
import { collectBoundValues, collectSqlText, createSequenceExecutor } from "./sql-test-utils";
import { buildEncryptedCollectionRecordPiiValues } from "../../lib/collection-pii-encryption";

test("upsertCollectionDailyCalendarDays batches multiple days into one upsert query", async () => {
  const { executor, queries } = createSequenceExecutor([
    { rows: [] },
    {
      rows: [
          {
            id: "calendar-1",
            username: "alpha.user",
            calendar_date: "2026-03-01",
            year: 2026,
            month: 3,
            day: 1,
            status: "WORKING",
            leave_type: null,
            note: null,
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
            username: "alpha.user",
            calendar_date: "2026-03-02",
            year: 2026,
            month: 3,
            day: 2,
            status: "HOLIDAY",
            leave_type: "AL",
            note: "Special Day",
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
      username: "alpha.user",
      year: 2026,
      month: 3,
      actor: "admin.user",
      days: [
        { day: 1, status: "WORKING", isWorkingDay: true, isHoliday: false, holidayName: null },
        { day: 2, status: "HOLIDAY", leaveType: "AL", note: "Special Day", isWorkingDay: false, isHoliday: true, holidayName: "AL" },
      ],
    },
    executor,
  );

  assert.equal(calendar.length, 2);
  assert.equal(queries.length, 2);

  const upsertSql = collectSqlText(queries[0]);
  assert.match(upsertSql, /INSERT INTO public\.collection_daily_calendar/i);
  assert.match(upsertSql, /collection_daily_calendar_audit/i);
  assert.match(upsertSql, /ON CONFLICT \(\(lower\(username\)\), calendar_date\)/i);
  assert.match(upsertSql, /\)\s*,\s*\(/i);
  assert.match(upsertSql, /::uuid/i);
  assert.match(upsertSql, /::date/i);
  assert.match(upsertSql, /::integer/i);
  assert.match(upsertSql, /::text/i);
  assert.match(upsertSql, /::boolean/i);

  const boundValues = collectBoundValues(queries[0]);
  assert.ok(boundValues.includes("alpha.user"));
  assert.ok(boundValues.includes(1));
  assert.ok(boundValues.includes(2));
  assert.ok(boundValues.includes("AL"));
  assert.ok(boundValues.includes("Special Day"));
  assert.equal(boundValues.filter((value) => value === "admin.user").length >= 2, true);

  const listSql = collectSqlText(queries[1]);
  assert.match(listSql, /SELECT\s+id,\s+username,\s+calendar_date/i);
  assert.match(listSql, /lower\(username\) = lower/i);
  assert.match(listSql, /ORDER BY day ASC/i);
});

test("listCollectionDailyCalendar maps rows using the provided executor", async () => {
  const { executor, queries } = createSequenceExecutor([
    {
      rows: [
        {
          id: "calendar-7",
          username: "alpha.user",
          calendar_date: "2026-04-07",
          year: 2026,
          month: 4,
          day: 7,
          status: "WORKING",
          leave_type: null,
          note: null,
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
      username: "alpha.user",
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

test("deleteCollectionDailyCalendarDay scopes deletion to nickname and date", async () => {
  const { executor, queries } = createSequenceExecutor([{ rows: [{ deleted_count: 1 }] }]);

  const deleted = await deleteCollectionDailyCalendarDay(
    {
      username: "alpha.user",
      year: 2026,
      month: 4,
      day: 7,
      actor: "superuser",
    },
    executor,
  );

  assert.equal(deleted, true);
  assert.equal(queries.length, 1);
  const queryText = collectSqlText(queries[0]);
  assert.match(queryText, /DELETE FROM public\.collection_daily_calendar/i);
  assert.match(queryText, /collection_daily_calendar_audit/i);
  assert.match(queryText, /lower\(username\) = lower/i);
  assert.match(queryText, /calendar_date/i);
  const boundValues = collectBoundValues(queries[0]);
  assert.ok(boundValues.includes("alpha.user"));
  assert.ok(boundValues.includes("2026-04-07"));
  assert.ok(boundValues.includes("superuser"));
});

test("listCollectionDailyCalendarAudit maps audit rows for one nickname date", async () => {
  const { executor, queries } = createSequenceExecutor([
    {
      rows: [
        {
          id: "audit-1",
          calendar_id: "calendar-7",
          username: "alpha.user",
          calendar_date: "2026-04-07",
          year: 2026,
          month: 4,
          day: 7,
          action: "UPDATE",
          old_status: "WORKING",
          new_status: "HOLIDAY",
          old_leave_type: null,
          new_leave_type: "AL",
          old_note: null,
          new_note: "Annual leave",
          old_holiday_name: null,
          new_holiday_name: "AL",
          actor: "superuser",
          created_at: "2026-04-07T08:00:00.000Z",
        },
      ],
    },
  ]);

  const audit = await listCollectionDailyCalendarAudit(
    {
      username: "alpha.user",
      year: 2026,
      month: 4,
      day: 7,
    },
    executor,
  );

  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.newLeaveType, "AL");
  assert.equal(audit[0]?.actor, "superuser");
  assert.equal(queries.length, 1);
  const queryText = collectSqlText(queries[0]);
  assert.match(queryText, /FROM public\.collection_daily_calendar_audit/i);
  assert.match(queryText, /ORDER BY created_at DESC, id DESC/i);
});

test("listCollectionDailyPaidCustomers falls back to encrypted PII when plaintext has been redacted", async () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-daily-test-key";

  try {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    const { executor, queries } = createSequenceExecutor([
      {
        rows: [
          {
            id: "record-1",
            customer_name: "",
            customer_name_encrypted: encrypted?.customerNameEncrypted,
            account_number: "",
            account_number_encrypted: encrypted?.accountNumberEncrypted,
            amount: "150.25",
            collection_staff_nickname: "Collector Alpha",
          },
        ],
      },
    ]);

    const rows = await listCollectionDailyPaidCustomers(
      {
        username: "alpha.user",
        date: "2026-04-08",
      },
      executor,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.customerName, "Alice Tan");
    assert.equal(rows[0]?.accountNumber, "ACC-1001");
    assert.equal(rows[0]?.amount, 150.25);
    assert.equal(queries.length, 1);
    const queryText = collectSqlText(queries[0]);
    assert.match(queryText, /customer_name_encrypted/i);
    assert.match(queryText, /account_number_encrypted/i);
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});
