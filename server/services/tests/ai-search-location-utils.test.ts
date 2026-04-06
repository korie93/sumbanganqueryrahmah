import assert from "node:assert/strict";
import test from "node:test";
import {
  extractLatLng,
  hasPostcodeCoord,
  isLatLng,
} from "../ai-search-query-utils";

test("extractLatLng parses numeric coordinate fields and postcode coord guards stay strict", () => {
  const coords = extractLatLng({
    Latitude: "3.139",
    Longitude: "101.6869",
  });

  assert.deepEqual(coords, { lat: 3.139, lng: 101.6869 });
  assert.equal(isLatLng(coords), true);
  assert.equal(hasPostcodeCoord(coords), true);
  assert.equal(isLatLng({ lat: 3.139, lng: "101.6869" }), false);
  assert.equal(hasPostcodeCoord(null), false);
});
