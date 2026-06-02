import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeaveTypeSelect } from "@/pages/collection/LeaveTypeSelect";

test("LeaveTypeSelect provides a stable accessible name", () => {
  const markup = renderToStaticMarkup(
    createElement(LeaveTypeSelect, {
      id: "daily-leave-type",
      value: null,
      onChange: () => undefined,
    }),
  );

  assert.match(markup, /id="daily-leave-type"/);
  assert.match(markup, /aria-label="Leave type"/);
  assert.match(markup, /<option value=""(?: selected="")?>Pilih leave type<\/option>/);
});
