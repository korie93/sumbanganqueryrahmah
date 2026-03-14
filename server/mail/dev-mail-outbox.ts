import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPublicAppBaseUrl } from "../auth/activation-links";

const DEFAULT_OUTBOX_MAX_FILES = 50;
const DEV_OUTBOX_FILE_PATTERN = /^\d{13}-[a-f0-9]{16}\.json$/i;
const DEV_OUTBOX_ID_PATTERN = /^\d{13}-[a-f0-9]{16}$/i;

type DevMailOutboxRecord = {
  createdAt: string;
  html: string;
  id: string;
  subject: string;
  text: string;
  to: string;
};

export type DevMailOutboxPreview = {
  createdAt: string;
  id: string;
  previewUrl: string;
  subject: string;
  to: string;
};

function readFlag(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function getDevMailOutboxDir(): string {
  const configured = String(process.env.MAIL_DEV_OUTBOX_DIR || "").trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "var", "dev-mail-outbox");
}

function getOutboxRetentionLimit(): number {
  const parsed = Number(process.env.MAIL_DEV_OUTBOX_MAX_FILES || DEFAULT_OUTBOX_MAX_FILES);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_OUTBOX_MAX_FILES;
  }
  return Math.floor(parsed);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isDevMailOutboxEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return readFlag("MAIL_DEV_OUTBOX_ENABLED", true);
}

function buildPreviewId(): string {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

function buildPreviewFilePath(previewId: string): string {
  return path.join(getDevMailOutboxDir(), `${previewId}.json`);
}

function buildPreviewUrl(previewId: string): string {
  const url = new URL(`/dev/mail-preview/${previewId}`, getPublicAppBaseUrl());
  return url.toString();
}

async function trimOutboxIfNeeded(): Promise<void> {
  const outboxDir = getDevMailOutboxDir();
  const entries = (await readdir(outboxDir)).filter((name) => DEV_OUTBOX_FILE_PATTERN.test(name));
  const maxFiles = getOutboxRetentionLimit();
  if (entries.length <= maxFiles) return;

  const staleEntries = entries.sort().slice(0, Math.max(0, entries.length - maxFiles));
  await Promise.all(
    staleEntries.map((entry) =>
      rm(path.join(outboxDir, entry), { force: true }),
    ),
  );
}

export async function writeDevMailPreview(input: {
  html: string;
  subject: string;
  text: string;
  to: string;
}): Promise<{
  messageId: string;
  previewUrl: string;
}> {
  const outboxDir = getDevMailOutboxDir();
  await mkdir(outboxDir, { recursive: true });
  await trimOutboxIfNeeded();

  const previewId = buildPreviewId();
  const record: DevMailOutboxRecord = {
    createdAt: new Date().toISOString(),
    html: input.html,
    id: previewId,
    subject: input.subject,
    text: input.text,
    to: input.to,
  };

  await writeFile(
    buildPreviewFilePath(previewId),
    JSON.stringify(record, null, 2),
    "utf8",
  );
  await trimOutboxIfNeeded();

  return {
    messageId: previewId,
    previewUrl: buildPreviewUrl(previewId),
  };
}

export async function readDevMailPreview(previewId: string): Promise<DevMailOutboxRecord | null> {
  const normalizedId = String(previewId || "").trim();
  if (!DEV_OUTBOX_ID_PATTERN.test(normalizedId)) {
    return null;
  }

  try {
    const raw = await readFile(buildPreviewFilePath(normalizedId), "utf8");
    const parsed = JSON.parse(raw) as Partial<DevMailOutboxRecord>;
    if (
      parsed.id !== normalizedId
      || typeof parsed.to !== "string"
      || typeof parsed.subject !== "string"
      || typeof parsed.text !== "string"
      || typeof parsed.html !== "string"
      || typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      html: parsed.html,
      id: parsed.id,
      subject: parsed.subject,
      text: parsed.text,
      to: parsed.to,
    };
  } catch {
    return null;
  }
}

export async function listDevMailPreviews(limit = 25): Promise<DevMailOutboxPreview[]> {
  if (!isDevMailOutboxEnabled()) {
    return [];
  }

  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 25;

  try {
    const outboxDir = getDevMailOutboxDir();
    const entries = (await readdir(outboxDir))
      .filter((name) => DEV_OUTBOX_FILE_PATTERN.test(name))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, normalizedLimit);

    const previews = await Promise.all(
      entries.map(async (entry) => {
        const previewId = entry.replace(/\.json$/i, "");
        const record = await readDevMailPreview(previewId);
        if (!record) return null;

        return {
          createdAt: record.createdAt,
          id: record.id,
          previewUrl: buildPreviewUrl(record.id),
          subject: record.subject,
          to: record.to,
        } satisfies DevMailOutboxPreview;
      }),
    );

    return previews.filter((preview): preview is DevMailOutboxPreview => preview !== null);
  } catch {
    return [];
  }
}

export async function deleteDevMailPreview(previewId: string): Promise<boolean> {
  if (!isDevMailOutboxEnabled()) {
    return false;
  }

  const normalizedId = String(previewId || "").trim();
  if (!DEV_OUTBOX_ID_PATTERN.test(normalizedId)) {
    return false;
  }

  try {
    await rm(buildPreviewFilePath(normalizedId));
    return true;
  } catch {
    return false;
  }
}

export async function clearDevMailOutbox(): Promise<number> {
  if (!isDevMailOutboxEnabled()) {
    return 0;
  }

  try {
    const outboxDir = getDevMailOutboxDir();
    const entries = (await readdir(outboxDir)).filter((name) => DEV_OUTBOX_FILE_PATTERN.test(name));
    if (entries.length === 0) {
      return 0;
    }

    const results = await Promise.allSettled(
      entries.map((entry) => rm(path.join(outboxDir, entry), { force: true })),
    );

    return results.filter((result) => result.status === "fulfilled").length;
  } catch {
    return 0;
  }
}

export function renderDevMailPreviewHtml(record: {
  createdAt: string;
  html: string;
  subject: string;
  text: string;
  to: string;
}): string {
  const createdAt = escapeHtml(record.createdAt);
  const subject = escapeHtml(record.subject);
  const to = escapeHtml(record.to);
  const text = escapeHtml(record.text);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
    <style>
      body { font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 48px; }
      .meta, .plain, .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .meta { padding: 20px; margin-bottom: 20px; }
      .card { padding: 24px; margin-bottom: 20px; }
      .plain { padding: 20px; }
      .label { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
      .value { font-size: 14px; margin-bottom: 16px; word-break: break-word; }
      .plain pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: Consolas, monospace; font-size: 13px; }
      .hint { color: #475569; font-size: 14px; margin: 0 0 16px; }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="meta">
        <p class="hint">This message was captured in the local development mail outbox.</p>
        <div class="label">To</div>
        <div class="value">${to}</div>
        <div class="label">Subject</div>
        <div class="value">${subject}</div>
        <div class="label">Created At</div>
        <div class="value">${createdAt}</div>
      </section>
      <section class="card">
        ${record.html}
      </section>
      <section class="plain">
        <div class="label">Plain Text</div>
        <pre>${text}</pre>
      </section>
    </main>
  </body>
</html>`;
}
