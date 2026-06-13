import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClientDeviceProfile,
  parseDeviceType,
} from "../browser";

test("buildClientDeviceProfile classifies desktop browsers from the server user-agent header", () => {
  const profile = buildClientDeviceProfile(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    + "AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36",
  );

  assert.deepEqual(profile, {
    browserName: "Chrome 149",
    deviceType: "desktop",
    platform: "Windows 10/11",
  });
});

test("device classification distinguishes mobile and tablet user agents", () => {
  assert.equal(
    parseDeviceType(
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 "
      + "Chrome/149.0.0.0 Mobile Safari/537.36",
    ),
    "mobile",
  );
  assert.equal(
    parseDeviceType(
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 "
      + "Chrome/149.0.0.0 Safari/537.36",
    ),
    "tablet",
  );
  assert.equal(parseDeviceType(undefined), "unknown");
});

test("device profiles use only the first bounded user-agent header value", () => {
  const profile = buildClientDeviceProfile([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
    + "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    "untrusted-second-value",
  ]);

  assert.equal(profile.deviceType, "mobile");
  assert.equal(profile.platform, "iOS");
  assert.equal(profile.browserName, "Safari 18");
});
