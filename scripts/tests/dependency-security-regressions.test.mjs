import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import nodemailer from "nodemailer";

const require = createRequire(import.meta.url);
// Exercise the CommonJS parser used by ESLint and the legacy message API used by mail plugins.
const yaml = require("js-yaml");
const MailMessage = require("nodemailer/lib/mailer/mail-message.js");

test("patched Nodemailer serializes ordinary text and HTML mail without SMTP", async () => {
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transporter.sendMail({
      from: "SQR Test <sender@example.test>",
      to: "recipient@example.test",
      subject: "SQR dependency compatibility",
      text: "Ordinary transactional email.",
      html: "<p>Ordinary transactional email.</p>",
    });

    assert.deepEqual(result.envelope, {
      from: "sender@example.test",
      to: ["recipient@example.test"],
    });
    assert.equal(Buffer.isBuffer(result.message), true);
    assert.equal(typeof result.messageId, "string");
    assert.ok(result.messageId.length > 0);
    const message = result.message.toString("utf8");
    assert.match(message, /Subject: SQR dependency compatibility/);
    assert.match(message, /Content-Type: multipart\/alternative;/);
    assert.match(message, /Content-Type: text\/plain; charset=utf-8/);
    assert.match(message, /Content-Type: text\/html; charset=utf-8/);
    assert.match(message, /<p>Ordinary transactional email\.<\/p>/);
  } finally {
    transporter.close();
  }
});

for (const scenario of [
  {
    name: "file",
    content: { path: path.resolve("__nonexistent_sqr_dependency_security_fixture__", "not-a-real-attachment.txt") },
    code: "EFILEACCESS",
    message: /^File access rejected for /,
  },
  {
    name: "URL",
    content: { href: "https://invalid.example/not-a-real-attachment.txt" },
    code: "EURLACCESS",
    message: /^Url access rejected for /,
  },
]) {
  test(`Nodemailer legacy resolveContent enforces transporter ${scenario.name} access restrictions before I/O`, async (t) => {
    // Fail closed even if a future dependency regresses: neither files nor URLs may be accessed by this test.
    const fileRead = t.mock.method(fs, "createReadStream", () => {
      throw new Error("Unexpected file access in dependency regression test");
    });
    const httpRequest = t.mock.method(http, "request", () => {
      throw new Error("Unexpected HTTP request in dependency regression test");
    });
    const httpsRequest = t.mock.method(https, "request", () => {
      throw new Error("Unexpected HTTPS request in dependency regression test");
    });
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const mail = new MailMessage(transporter, {
        // Message-level flags must not reopen access disabled by the transporter.
        disableFileAccess: false,
        disableUrlAccess: false,
      });
      await assert.rejects(
        new Promise((resolve, reject) => {
          mail.resolveContent({ attachment: scenario.content }, "attachment", (error, content) => {
            if (error) reject(error);
            else resolve(content);
          });
        }),
        (error) => {
          assert.equal(error.code, scenario.code);
          assert.match(error.message, scenario.message);
          return true;
        },
      );
      assert.equal(fileRead.mock.callCount(), 0);
      assert.equal(httpRequest.mock.callCount(), 0);
      assert.equal(httpsRequest.mock.callCount(), 0);
    } finally {
      transporter.close();
    }
  });
}

test("js-yaml counts empty source mappings toward the merge-work limit", () => {
  // Three empty sources exercise the advisory boundary without a large or CPU-intensive payload.
  const input = "base: &empty {}\nmerged:\n  <<: [*empty, *empty, *empty]\n";
  assert.deepEqual(yaml.load(input, { maxTotalMergeKeys: 3 }), {
    base: {},
    merged: {},
  });
  assert.throws(
    () => yaml.load(input, { maxTotalMergeKeys: 2 }),
    /merge keys exceeded maxTotalMergeKeys \(2\)/,
  );
});
