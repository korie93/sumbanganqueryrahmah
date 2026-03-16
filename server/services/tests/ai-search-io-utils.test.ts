import assert from "node:assert/strict";
import test from "node:test";
import { createAiSafeBranchLookups } from "../ai-search-io-utils";

test("createAiSafeBranchLookups proxies successful branch queries through timeout wrapper", async () => {
  const lookups = createAiSafeBranchLookups({
    findBranchesByText: async ({ query, limit }) => [{ name: `${query}:${limit}` }] as never[],
    findBranchesByPostcode: async ({ postcode, limit }) =>
      [{ name: `${postcode}:${limit}` }] as never[],
    getNearestBranches: async ({ lat, lng, limit }) =>
      [{ name: `${lat},${lng}:${limit}`, distanceKm: 3.5 }] as never[],
    getPostcodeLatLng: async () => ({ lat: 3.14, lng: 101.75 }),
  });

  const [text, postcode, nearest, coord] = await Promise.all([
    lookups.findBranchesByText("ampang", 2, 100),
    lookups.findBranchesByPostcode("68000", 1, 100),
    lookups.nearestBranches(3.14, 101.75, 1, 100),
    lookups.postcodeLatLng("68000", 100),
  ]);

  assert.equal(text[0]?.name, "ampang:2");
  assert.equal(postcode[0]?.name, "68000:1");
  assert.equal(nearest[0]?.distanceKm, 3.5);
  assert.deepEqual(coord, { lat: 3.14, lng: 101.75 });
});

test("createAiSafeBranchLookups returns safe empty fallbacks on errors or timeouts", async () => {
  const lookups = createAiSafeBranchLookups({
    findBranchesByText: async () => {
      throw new Error("fail");
    },
    findBranchesByPostcode: async () => {
      await new Promise(() => {});
      return [];
    },
    getNearestBranches: async () => {
      throw new Error("fail");
    },
    getPostcodeLatLng: async () => {
      throw new Error("fail");
    },
  });

  const [text, postcode, nearest, coord] = await Promise.all([
    lookups.findBranchesByText("ampang", 2, 20),
    lookups.findBranchesByPostcode("68000", 1, 1),
    lookups.nearestBranches(3.14, 101.75, 1, 20),
    lookups.postcodeLatLng("68000", 20),
  ]);

  assert.deepEqual(text, []);
  assert.deepEqual(postcode, []);
  assert.deepEqual(nearest, []);
  assert.equal(coord, null);
});
