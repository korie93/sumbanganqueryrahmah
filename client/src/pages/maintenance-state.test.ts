import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeMaintenancePayload,
  parseStoredMaintenanceState,
  type MaintenancePayload,
} from "@/pages/maintenance-state";

const defaultState: MaintenancePayload = {
  maintenance: true,
  message: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
  type: "hard",
  startTime: null,
  endTime: null,
};

test("mergeMaintenancePayload keeps existing fields when incoming payload is partial", () => {
  assert.deepEqual(
    mergeMaintenancePayload(defaultState, {
      maintenance: false,
      message: "Maintenance selesai.",
    }),
    {
      maintenance: false,
      message: "Maintenance selesai.",
      type: "hard",
      startTime: null,
      endTime: null,
    },
  );
});

test("parseStoredMaintenanceState rejects malformed JSON and normalizes mode/time values", () => {
  assert.deepEqual(
    parseStoredMaintenanceState("not-json", defaultState),
    defaultState,
  );

  assert.deepEqual(
    parseStoredMaintenanceState(
      JSON.stringify({
        maintenance: true,
        message: "Soft maintenance",
        type: "soft",
        startTime: "2026-03-27T01:00:00.000Z",
        endTime: "",
      }),
      defaultState,
    ),
    {
      maintenance: true,
      message: "Soft maintenance",
      type: "soft",
      startTime: "2026-03-27T01:00:00.000Z",
      endTime: null,
    },
  );
});
