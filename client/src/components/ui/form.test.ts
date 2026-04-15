import assert from "node:assert/strict";
import test from "node:test";
import { mergeAriaDescribedByIds } from "@/components/ui/form";

test("mergeAriaDescribedByIds preserves caller ids and appends stable form ids once", () => {
  assert.equal(
    mergeAriaDescribedByIds(
      "custom-help custom-help",
      "field-description",
      "field-message",
      "field-description",
    ),
    "custom-help field-description field-message",
  );
});
