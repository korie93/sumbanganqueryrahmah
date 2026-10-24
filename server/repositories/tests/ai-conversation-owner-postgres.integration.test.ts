import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { HttpError } from "../../http/errors";

// Set only by a disposable-cluster runner. No dotenv loading or default DB target.
const isolated = process.env.SQR_AUTH_ISOLATED_CLUSTER === "1";
test("AI conversation ownership at the final PostgreSQL read and write", { skip: !isolated }, async (t) => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const port = Number(process.env.PG_PORT);
  assert.ok(Number.isInteger(port) && port > 0 && port < 65_536);
  const pool = new pg.Pool({
    host: "127.0.0.1", port, user: "sqr_fixture", database: "sqr_auth_recovery_test",
    max: 3, connectionTimeoutMillis: 3_000, statement_timeout: 10_000,
  });
  const database = drizzle(pool);
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const { ensureUsersBootstrapSchema } = await import("../../internal/users-bootstrap/schema");
  const {
    assertAiConversationOwner, createAiConversation, getAiConversationMessages, saveAiConversationMessage,
  } = await import("../ai-repository-conversation-utils");
  const isNotFound = (error: unknown) => error instanceof HttpError
    && error.statusCode === 404 && error.message === "Conversation not found.";
  const aliceUsername = `aiowner_alice_${randomUUID().slice(0, 8)}`;
  const bobUsername = `aiowner_bob_${randomUUID().slice(0, 8)}`;
  try {
    await ensureUsersBootstrapSchema(database);
    await pool.query("INSERT INTO public.users (id,username,password_hash,role,status) VALUES ('alice-id',$1,'fixture-not-an-authentication-hash','user','active'), ('bob-id',$2,'fixture-not-an-authentication-hash','user','active')", [aliceUsername, bobUsername]);
    await pool.query(`
      CREATE TABLE public.ai_conversations (
        id text PRIMARY KEY, created_by text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE public.ai_messages (
        id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
        role text NOT NULL, content text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    const bobId = await createAiConversation("bob-id", database);
    const aliceId = await createAiConversation("alice-id", database);
    assert.match(bobId, /^[0-9a-f-]{36}$/);
    assert.equal((await pool.query("SELECT created_by FROM public.ai_conversations WHERE id=$1", [aliceId])).rows[0].created_by, "account:alice-id");
    await assertAiConversationOwner(bobId, "bob-id", database);
    assert.deepEqual(await getAiConversationMessages(bobId, "bob-id", 3, database), []);
    await saveAiConversationMessage(bobId, "bob-id", "user", "BOB-PRIVATE-SENTINEL", database);
    const before = (await pool.query("SELECT * FROM public.ai_messages WHERE conversation_id = $1 ORDER BY id", [bobId])).rows;

    await t.test("foreign and missing selectors deny both reads and writes with the same 404", async () => {
      for (const id of [bobId, randomUUID()]) {
        await assert.rejects(assertAiConversationOwner(id, "alice-id", database), isNotFound);
        // Direct calls bypass the earlier service guard: the final queries must still deny.
        await assert.rejects(getAiConversationMessages(id, "alice-id", 3, database), isNotFound);
        await assert.rejects(saveAiConversationMessage(id, "alice-id", "user", "ATTACKER-APPEND", database), isNotFound);
        await assert.rejects(saveAiConversationMessage(id, "alice-id", "assistant", "ATTACKER-REPLY", database), isNotFound);
      }
      assert.deepEqual((await pool.query("SELECT * FROM public.ai_messages WHERE conversation_id = $1 ORDER BY id", [bobId])).rows, before);
    });
    await t.test("each owner can read and append only their own conversation", async () => {
      await assertAiConversationOwner(aliceId, "alice-id", database);
      await saveAiConversationMessage(aliceId, "alice-id", "user", "Alice question", database);
      await saveAiConversationMessage(aliceId, "alice-id", "assistant", "Alice reply", database);
      const aliceHistory = await getAiConversationMessages(aliceId, "alice-id", 3, database);
      assert.deepEqual(aliceHistory.sort((left, right) => left.role.localeCompare(right.role)), [
        { role: "assistant", content: "Alice reply" }, { role: "user", content: "Alice question" },
      ]);
      assert.deepEqual(await getAiConversationMessages(bobId, "bob-id", 3, database), [
        { role: "user", content: "BOB-PRIVATE-SENTINEL" },
      ]);
      const rows = (await pool.query("SELECT content FROM public.ai_messages ORDER BY content")).rows;
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => !String(row.content).includes("ATTACKER")));
    });
    await t.test("renamed owner retains history while another account reusing the old username cannot inherit it", async () => {
      const renamedUsername = `${aliceUsername}.new`;
      await pool.query("UPDATE public.users SET username=$1 WHERE id='alice-id'", [renamedUsername]);
      await pool.query("INSERT INTO public.users(id,username,password_hash,role,status) VALUES ('replacement-id',$1,'fixture-not-an-authentication-hash','user','active')", [aliceUsername]);
      const owner = (await pool.query("SELECT id FROM public.users WHERE username=$1", [renamedUsername])).rows[0].id as string;
      const replacement = (await pool.query("SELECT id FROM public.users WHERE username=$1", [aliceUsername])).rows[0].id as string;
      await assertAiConversationOwner(aliceId, owner, database);
      const beforeRename = await getAiConversationMessages(aliceId, owner, 20, database);
      assert.equal(beforeRename.length, 2);
      await assert.rejects(assertAiConversationOwner(aliceId, replacement, database), isNotFound);
      await assert.rejects(getAiConversationMessages(aliceId, replacement, 20, database), isNotFound);
      await assert.rejects(saveAiConversationMessage(aliceId, replacement, "user", "ATTACKER-REUSED-NAME", database), isNotFound);
      assert.deepEqual(await getAiConversationMessages(aliceId, owner, 20, database), beforeRename);
      await saveAiConversationMessage(aliceId, owner, "user", "Owner after rename", database);
      assert.equal((await getAiConversationMessages(aliceId, owner, 20, database)).length, 3);
    });
    await t.test("legacy usernames, including one exactly equal to an internal account ID, fail closed", async () => {
      for (const legacyOwner of [aliceUsername, "alice-id"]) {
        const legacyId = randomUUID();
        await pool.query("INSERT INTO public.ai_conversations(id,created_by) VALUES($1,$2)", [legacyId, legacyOwner]);
        await pool.query("INSERT INTO public.ai_messages(id,conversation_id,role,content) VALUES($1,$2,'user','LEGACY-PRIVATE-SENTINEL')", [randomUUID(), legacyId]);
        for (const userId of ["alice-id", "replacement-id"]) {
          await assert.rejects(assertAiConversationOwner(legacyId, userId, database), isNotFound);
          await assert.rejects(getAiConversationMessages(legacyId, userId, 3, database), isNotFound);
          await assert.rejects(saveAiConversationMessage(legacyId, userId, "user", "ATTACKER-LEGACY", database), isNotFound);
        }
        assert.deepEqual((await pool.query("SELECT content FROM public.ai_messages WHERE conversation_id=$1", [legacyId])).rows,
          [{ content: "LEGACY-PRIVATE-SENTINEL" }]);
      }
    });
  } finally {
    await pool.end();
    await runtime.closePostgresPools();
  }
});
