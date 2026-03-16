import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiSearchIntent } from "../ai-search-intent-utils";

test("resolveAiSearchIntent uses fallback parser in fast mode", async () => {
  const intent = await resolveAiSearchIntent({
    query: "cawangan terdekat untuk 900101015555",
    timeoutMs: 1000,
    intentMode: "fast",
    withAiCircuit: async (operation) => operation(),
    ollamaChat: async () => '{"intent":"ignored"}',
  });

  assert.equal(intent.need_nearest_branch, true);
  assert.equal(intent.entities.ic, "900101015555");
});

test("resolveAiSearchIntent parses structured JSON from chat and falls back on invalid payload", async () => {
  const parsed = await resolveAiSearchIntent({
    query: "Ali 0123456789",
    timeoutMs: 1000,
    intentMode: "llm",
    withAiCircuit: async (operation) => operation(),
    ollamaChat: async () =>
      '{"intent":"search_person","entities":{"name":"Ali","ic":null,"account_no":null,"phone":"0123456789","address":null},"need_nearest_branch":false}',
  });
  const fallback = await resolveAiSearchIntent({
    query: "Siti Nurhaliza",
    timeoutMs: 1000,
    intentMode: "llm",
    withAiCircuit: async () => {
      throw new Error("boom");
    },
    ollamaChat: async () => "not-used",
  });

  assert.equal(parsed.intent, "search_person");
  assert.equal(parsed.entities.phone, "0123456789");
  assert.equal(fallback.entities.name, "Siti Nurhaliza");
  assert.equal(fallback.need_nearest_branch, false);
});
