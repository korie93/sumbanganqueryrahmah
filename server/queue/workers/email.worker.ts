import type { Job } from "bullmq";
import { sendMail, type MailSendResult } from "../../mail/mailer";

export type EmailJobName = "send";
export type EmailJobData = {
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: string;
};
export type EmailJob = Job<EmailJobData, MailSendResult, EmailJobName>;

function assertEmailJobData(data: EmailJobData): void {
  if (
    typeof data.html !== "string"
    || typeof data.subject !== "string"
    || typeof data.text !== "string"
    || typeof data.to !== "string"
  ) {
    throw new Error("Invalid email job payload");
  }
}

export async function processEmailJob(job: EmailJob): Promise<MailSendResult> {
  if (job.name !== "send") {
    throw new Error(`Unsupported email job: ${job.name}`);
  }

  assertEmailJobData(job.data);
  return sendMail({
    html: job.data.html,
    subject: job.data.subject,
    text: job.data.text,
    to: job.data.to,
  });
}

