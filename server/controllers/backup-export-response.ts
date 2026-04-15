import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { buildContentDispositionHeader } from "../http/content-disposition";
import { logger } from "../lib/logger";

type BackupExportResponseBody = {
  fileName: string;
  payloadPrefixJson: string;
  backupDataJsonChunks: AsyncIterable<string>;
  payloadSuffixJson: string;
};

export async function sendBackupExportResponse(params: {
  res: Response;
  backupId: string;
  fileName: string;
  payloadPrefixJson: string;
  backupDataJsonChunks: AsyncIterable<string>;
  payloadSuffixJson: string;
  username: string;
}): Promise<void> {
  params.res.setHeader("Content-Type", "application/json; charset=utf-8");
  params.res.setHeader("Cache-Control", "no-store");
  params.res.setHeader(
    "Content-Disposition",
    buildContentDispositionHeader("attachment", params.fileName, "backup.json"),
  );
  params.res.statusCode = 200;

  const responseStream = Readable.from(iterateBackupExportChunks({
    payloadPrefixJson: params.payloadPrefixJson,
    backupDataJsonChunks: params.backupDataJsonChunks,
    payloadSuffixJson: params.payloadSuffixJson,
  }));

  try {
    await pipeline(responseStream, params.res);
  } catch (error) {
    logger.warn("Backup export response stream failed", {
      backupId: params.backupId,
      fileName: params.fileName,
      username: params.username,
      error: error instanceof Error ? error.message : "Unknown backup export stream failure",
    });

    if (!params.res.destroyed && !params.res.writableEnded) {
      params.res.destroy(error instanceof Error ? error : undefined);
    }
  }
}

export async function* iterateBackupExportChunks(
  body: Pick<
    BackupExportResponseBody,
    "payloadPrefixJson" | "backupDataJsonChunks" | "payloadSuffixJson"
  >,
): AsyncGenerator<string> {
  yield body.payloadPrefixJson;
  for await (const chunk of body.backupDataJsonChunks) {
    if (chunk) {
      yield chunk;
    }
  }
  yield body.payloadSuffixJson;
}
