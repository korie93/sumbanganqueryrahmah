import assert from "node:assert/strict";
import test from "node:test";

import { resolveSmtpDeliveryOutcome } from "../../mail/mailer";

test("resolveSmtpDeliveryOutcome accepts normal SMTP delivery info", () => {
  assert.deepEqual(
    resolveSmtpDeliveryOutcome({
      accepted: ["user@example.com"],
      rejected: [],
      responseCode: 250,
    }),
    {
      errorCode: null,
      errorMessage: null,
      sent: true,
    },
  );
});

test("resolveSmtpDeliveryOutcome rejects SMTP responses with rejected recipients", () => {
  assert.deepEqual(
    resolveSmtpDeliveryOutcome({
      accepted: [],
      rejected: ["user@example.com"],
      responseCode: 250,
    }),
    {
      errorCode: "MAIL_RECIPIENT_REJECTED",
      errorMessage: "SMTP server rejected one or more recipients.",
      sent: false,
    },
  );
});

test("resolveSmtpDeliveryOutcome rejects empty accepted-recipient responses", () => {
  assert.deepEqual(
    resolveSmtpDeliveryOutcome({
      accepted: [],
      pending: [],
      rejected: [],
      responseCode: 250,
    }),
    {
      errorCode: "MAIL_NOT_ACCEPTED",
      errorMessage: "SMTP server did not accept the message for delivery.",
      sent: false,
    },
  );
});

test("resolveSmtpDeliveryOutcome rejects SMTP error response codes", () => {
  assert.deepEqual(
    resolveSmtpDeliveryOutcome({
      accepted: ["user@example.com"],
      rejected: [],
      responseCode: 550,
    }),
    {
      errorCode: "MAIL_SMTP_REJECTED",
      errorMessage: "SMTP server rejected the message.",
      sent: false,
    },
  );
});
