import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import {
  assertAiConversationOwner,
  createAiConversation,
  getAiConversationMessages,
  saveAiConversationMessage,
} from "../ai-repository-conversation-utils";
import { collectBoundValues, collectSqlLiteralText, createSequenceExecutor } from "./sql-test-utils";

const isNotFound = (error: unknown) => error instanceof HttpError
  && error.statusCode === 404 && error.message === "Conversation not found.";

test("conversation authorization and final reads require both selector and owner", async () => {
  const { executor, queries } = createSequenceExecutor([
    { rows: [{ id: "conversation-id" }] },
    { rows: [{ role: "user", content: "private history" }] },
  ]);
  await assertAiConversationOwner("conversation-id", "alice", executor);
  assert.deepEqual(await getAiConversationMessages("conversation-id", "alice", 3, executor), [
    { role: "user", content: "private history" },
  ]);
  for (const query of queries) {
    assert.match(collectSqlLiteralText(query), /\bid\s*=.*AND.*created_by\s*=/s);
    assert.ok(collectBoundValues(query).includes("conversation-id"));
    assert.ok(collectBoundValues(query).includes("account:alice"));
    assert.equal(collectBoundValues(query).includes("alice"), false);
  }
});

test("an owned empty conversation remains usable", async () => {
  const { executor } = createSequenceExecutor([{ rows: [{ role: null, content: null }] }]);
  assert.deepEqual(await getAiConversationMessages("empty-id", "alice", 3, executor), []);
});

test("every conversation operation returns the same 404 when ownership is absent", async () => {
  const { executor } = createSequenceExecutor([{ rows: [] }, { rows: [] }, { rows: [] }]);
  await assert.rejects(assertAiConversationOwner("foreign-or-missing", "alice", executor), isNotFound);
  await assert.rejects(getAiConversationMessages("foreign-or-missing", "alice", 3, executor), isNotFound);
  await assert.rejects(saveAiConversationMessage("foreign-or-missing", "alice", "user", "injection", executor), isNotFound);
});

test("final message insertion derives its conversation from an owner-scoped SELECT", async () => {
  const { executor, queries } = createSequenceExecutor([{ rows: [{ id: "message-id" }] }]);
  await saveAiConversationMessage("conversation-id", "alice", "assistant", "reply", executor);
  const text = collectSqlLiteralText(queries[0]);
  assert.match(text, /INSERT INTO public\.ai_messages.*SELECT.*FROM public\.ai_conversations/s);
  assert.match(text, /conversation\.id\s*=.*AND conversation\.created_by\s*=.*RETURNING id/s);
  const values = collectBoundValues(queries[0]);
  assert.ok(values.includes("conversation-id"));
  assert.ok(values.includes("account:alice"));
  assert.equal(values.includes("alice"), false);
  assert.ok(values.includes("reply"));
});

test("new conversations store a namespaced immutable account ID", async () => {
  const { executor, queries } = createSequenceExecutor([{ rows: [] }]);
  await createAiConversation("account-id", executor);
  assert.ok(collectBoundValues(queries[0]).includes("account:account-id"));
  assert.equal(collectBoundValues(queries[0]).includes("account-id"), false);
});

test("all repository operations reject missing immutable identity before executing SQL", async () => {
  const { executor, queries } = createSequenceExecutor([]);
  const denied = (error: unknown) => error instanceof HttpError && error.statusCode === 401;
  await assert.rejects(createAiConversation("", executor), denied);
  await assert.rejects(assertAiConversationOwner("id", "", executor), denied);
  await assert.rejects(getAiConversationMessages("id", "", 3, executor), denied);
  await assert.rejects(saveAiConversationMessage("id", "", "user", "input", executor), denied);
  assert.deepEqual(queries, []);
});
