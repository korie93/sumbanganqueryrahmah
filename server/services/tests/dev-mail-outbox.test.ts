import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listDevMailPreviewsPage,
  readDevMailPreview,
  writeDevMailPreview,
} from "../../mail/dev-mail-outbox";
import { getInternalMetricsSnapshot } from "../../internal/metrics";

async function withDevMailOutboxFixture(
  run: (context: { outboxDir: string }) => Promise<void>,
): Promise<void> {
  const previousDir = process.env.MAIL_DEV_OUTBOX_DIR;
  const previousEnabled = process.env.MAIL_DEV_OUTBOX_ENABLED;
  const previousNodeEnv = process.env.NODE_ENV;
  const outboxDir = await mkdtemp(path.join(os.tmpdir(), "sqr-dev-mail-outbox-safe-json-"));

  process.env.MAIL_DEV_OUTBOX_DIR = outboxDir;
  process.env.MAIL_DEV_OUTBOX_ENABLED = "1";
  delete process.env.NODE_ENV;

  try {
    await run({ outboxDir });
  } finally {
    if (previousDir === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_DIR;
    } else {
      process.env.MAIL_DEV_OUTBOX_DIR = previousDir;
    }

    if (previousEnabled === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_ENABLED;
    } else {
      process.env.MAIL_DEV_OUTBOX_ENABLED = previousEnabled;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    await rm(outboxDir, { recursive: true, force: true });
  }
}

test("readDevMailPreview returns null for malformed JSON without throwing", async () => {
  await withDevMailOutboxFixture(async ({ outboxDir }) => {
    const previewId = "1700000000000-abcdefabcdefabcd";
    await writeFile(
      path.join(outboxDir, `${previewId}.json`),
      "{\"id\":\"1700000000000-abcdefabcdefabcd\",",
      "utf8",
    );
    const before = getInternalMetricsSnapshot().counters.jsonParseFailuresTotal;

    const preview = await readDevMailPreview(previewId);

    assert.equal(preview, null);
    const after = getInternalMetricsSnapshot().counters.jsonParseFailuresTotal;
    assert.equal(after, before + 1);
  });
});

test("dev mail outbox listing skips malformed records and keeps valid previews", async () => {
  await withDevMailOutboxFixture(async ({ outboxDir }) => {
    const valid = await writeDevMailPreview({
      html: "<p>Hello</p>",
      subject: "Valid preview",
      text: "Hello",
      to: "recipient@example.test",
    });
    await writeFile(
      path.join(outboxDir, "1700000000001-bbbbbbbbbbbbbbbb.json"),
      JSON.stringify({ id: "1700000000001-bbbbbbbbbbbbbbbb", subject: "missing fields" }),
      "utf8",
    );

    const page = await listDevMailPreviewsPage({ page: 1, pageSize: 10 });

    assert.equal(page.total, 1);
    assert.equal(page.previews[0]?.id, valid.messageId);
    assert.equal(page.previews[0]?.subject, "Valid preview");
  });
});
