import assert from "node:assert/strict"
import test from "node:test"

import { buildGeneralSearchRowAriaLabel } from "@/pages/general-search/general-search-row-aria"

test("buildGeneralSearchRowAriaLabel summarizes the most useful visible fields", () => {
  const label = buildGeneralSearchRowAriaLabel({
    headers: ["Name", "Account", "Phone"],
    resultNumber: 3,
    row: {
      Name: "Siti Aminah",
      Account: "ACC-001",
      Phone: "0123456789",
    },
  })

  assert.equal(
    label,
    "Search result 3. Name: Siti Aminah. Account: ACC-001. Phone: 0123456789"
  )
})
