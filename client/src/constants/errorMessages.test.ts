import assert from "node:assert/strict";
import test from "node:test";

import {
  getHttpStatusErrorMessage,
  isGenericApiErrorMessage,
  NETWORK_ERROR_MESSAGE,
  UNKNOWN_API_ERROR_MESSAGE,
} from "./errorMessages";

test("getHttpStatusErrorMessage maps common HTTP failures to contextual Malay guidance", () => {
  assert.match(getHttpStatusErrorMessage(400), /Semak input/i);
  assert.match(getHttpStatusErrorMessage(401), /log masuk semula/i);
  assert.match(getHttpStatusErrorMessage(403), /tiada kebenaran/i);
  assert.match(getHttpStatusErrorMessage(404), /tidak ditemui/i);
  assert.match(getHttpStatusErrorMessage(422), /Input tidak dapat diproses/i);
  assert.match(getHttpStatusErrorMessage(429, { retryAfterMs: 2_100 }), /3 saat/);
  assert.match(getHttpStatusErrorMessage(500), /Ralat server/i);
  assert.match(getHttpStatusErrorMessage(504), /mengambil masa terlalu lama/i);
});

test("generic API error detection keeps specific backend messages intact", () => {
  assert.equal(isGenericApiErrorMessage("Request failed"), true);
  assert.equal(isGenericApiErrorMessage("Something went wrong"), true);
  assert.equal(isGenericApiErrorMessage("Collection receipt scan failed"), false);
  assert.match(NETWORK_ERROR_MESSAGE, /Sambungan terputus/);
  assert.match(UNKNOWN_API_ERROR_MESSAGE, /Permintaan tidak dapat diselesaikan/);
});
