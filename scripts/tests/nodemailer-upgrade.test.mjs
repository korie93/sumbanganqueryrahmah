import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import nodemailer from "nodemailer";

// A synthetic, loopback-only SMTP peer: no credentials, real addresses or remote delivery.
async function smtpFixture(t, { rejectRecipient = false, requireTLS = false } = {}) {
  const sockets = new Set();
  const commands = [];
  const messages = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setEncoding("utf8");
    socket.setTimeout(3_000, () => socket.destroy());
    let buffer = "";
    let message = null;
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (message !== null) {
          if (line === ".") {
            messages.push(message.join("\r\n"));
            message = null;
            socket.write("250 2.0.0 Queued locally\r\n");
          } else {
            message.push(line);
          }
          continue;
        }
        commands.push(line);
        if (/^(EHLO|HELO) /i.test(line)) {
          // Deliberately no STARTTLS capability; required TLS must never downgrade.
          socket.write("250 local.test\r\n");
        } else if (/^MAIL FROM:/i.test(line)) {
          socket.write("250 2.1.0 Sender accepted\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          socket.write(rejectRecipient ? "550 5.1.1 Recipient rejected\r\n" : "250 2.1.5 Recipient accepted\r\n");
        } else if (line === "DATA") {
          message = [];
          socket.write("354 End with a dot\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Goodbye\r\n");
        } else {
          socket.write("502 Command unavailable\r\n");
        }
      }
    });
    socket.write("220 local.test ESMTP test fixture\r\n");
  });
  let transporter;
  t.after(async () => {
    transporter?.close();
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  transporter = nodemailer.createTransport({
    host: "127.0.0.1",
    port: server.address().port,
    secure: false,
    requireTLS,
    connectionTimeout: 2_000,
    greetingTimeout: 2_000,
    socketTimeout: 2_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return { transporter, commands, messages };
}

const mail = {
  from: "SQR Test <sender@example.test>",
  to: "recipient@example.test",
  subject: "SQR local SMTP compatibility",
  text: "Synthetic transactional message.",
  html: "<p>Synthetic transactional message.</p>",
};

test("Nodemailer submits transactional email to a loopback SMTP receiver", { timeout: 10_000 }, async (t) => {
  const { transporter, commands, messages } = await smtpFixture(t);
  const result = await transporter.sendMail(mail);
  assert.deepEqual(result.accepted, ["recipient@example.test"]);
  assert.deepEqual(result.rejected, []);
  assert.match(result.response, /^250 /);
  assert.ok(commands.includes("MAIL FROM:<sender@example.test>"));
  assert.ok(commands.includes("RCPT TO:<recipient@example.test>"));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Subject: SQR local SMTP compatibility/);
  assert.match(messages[0], /Synthetic transactional message\./);
  assert.match(messages[0], /<p>Synthetic transactional message\.<\/p>/);
});

test("Nodemailer does not append trailing comment text to a quoted-local-part recipient", { timeout: 10_000 }, async (t) => {
  // Small GHSA-g57g-f23g-4646 regression input; never send it to a real mail server.
  const { transporter, commands } = await smtpFixture(t);
  const result = await transporter.sendMail({ ...mail, to: '"user"@example.test(x)evil.test' });
  assert.deepEqual(result.envelope.to, ["user@example.test"]);
  assert.deepEqual(result.accepted, ["user@example.test"]);
  assert.deepEqual(commands.filter((command) => command.startsWith("RCPT TO:")), ["RCPT TO:<user@example.test>"]);
});

test("Nodemailer preserves SMTP recipient rejection without submitting message data", { timeout: 10_000 }, async (t) => {
  const { transporter, commands, messages } = await smtpFixture(t, { rejectRecipient: true });
  await assert.rejects(transporter.sendMail(mail), (error) => {
    assert.equal(error.code, "EENVELOPE");
    assert.equal(error.responseCode, 550);
    assert.deepEqual(error.rejected, ["recipient@example.test"]);
    return true;
  });
  assert.equal(commands.includes("DATA"), false);
  assert.deepEqual(messages, []);
});

test("Nodemailer fails closed when required STARTTLS is unavailable", { timeout: 10_000 }, async (t) => {
  const { transporter, commands, messages } = await smtpFixture(t, { requireTLS: true });
  await assert.rejects(transporter.sendMail(mail), (error) => {
    assert.equal(error.code, "ETLS");
    assert.equal(error.command, "STARTTLS");
    return true;
  });
  assert.ok(commands.includes("STARTTLS"));
  assert.equal(commands.some((command) => /^(MAIL FROM:|RCPT TO:|DATA$|AUTH )/.test(command)), false);
  assert.deepEqual(messages, []);
});
