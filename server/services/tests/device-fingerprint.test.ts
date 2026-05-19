import assert from "node:assert/strict";
import test from "node:test";

import {
  deviceFingerprintMatchesStored,
  getDeviceFingerprintLookupCandidates,
  hashDeviceFingerprint,
  isHashedDeviceFingerprint,
} from "../../auth/device-fingerprint";

test("hashDeviceFingerprint stores deterministic non-raw fingerprints", () => {
  const rawFingerprint = "browser-device-fingerprint-123";
  const hashed = hashDeviceFingerprint(rawFingerprint);

  assert.ok(hashed);
  assert.equal(isHashedDeviceFingerprint(hashed), true);
  assert.equal(hashed, hashDeviceFingerprint(rawFingerprint));
  assert.notEqual(hashed, rawFingerprint);
  assert.equal(hashDeviceFingerprint(null), null);
  assert.equal(hashDeviceFingerprint("  "), null);
});

test("getDeviceFingerprintLookupCandidates preserves legacy raw lookup compatibility", () => {
  const rawFingerprint = "legacy-device-fingerprint";
  const candidates = getDeviceFingerprintLookupCandidates(rawFingerprint);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0], hashDeviceFingerprint(rawFingerprint));
  assert.equal(candidates[1], rawFingerprint);
});

test("deviceFingerprintMatchesStored compares hashed and legacy values safely", () => {
  const rawFingerprint = "device-to-match";
  const hashed = hashDeviceFingerprint(rawFingerprint);

  assert.equal(deviceFingerprintMatchesStored(rawFingerprint, hashed), true);
  assert.equal(deviceFingerprintMatchesStored(rawFingerprint, rawFingerprint), true);
  assert.equal(deviceFingerprintMatchesStored("other-device", hashed), false);
});
