import { mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { COLLECTION_OFFLINE_EXPORT_MAX_RECORDS, collectionOfflineRecordId, type CollectionOfflineExportExpectation } from "../../../shared/common/collection-offline-export";
import { parseCollectionAmountToCents } from "../../../shared/collection-amount-types";
import type { AuthenticatedRequest } from "../../auth/guards";
import { badRequest, forbidden, HttpError, notFound } from "../../http/errors";
import type { CollectionRecord } from "../../storage-postgres-collection-types";
import { logger } from "../../lib/logger";
import { createCollectionOfflineArchive, getOfflineExportReceipts } from "../../services/collection/collection-offline-archive";
import { canUserAccessCollectionRecord, isCollectionAccessUserSnapshotUsable } from "../collection-access";
import type { CollectionRouteContext } from "./collection-route-shared";

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseSelection(body: unknown) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "recordIds" && key !== "expected") || !("recordIds" in body) ||
      !Array.isArray(body.recordIds) || !body.recordIds.length) throw badRequest("Pilih sekurang-kurangnya satu rekod.", "BAD_REQUEST");
  if (body.recordIds.length > COLLECTION_OFFLINE_EXPORT_MAX_RECORDS) {
    throw new HttpError(413, "Pilihan melebihi had rekod bagi satu eksport.", { code: "PAYLOAD_TOO_LARGE" });
  }
  const ids = new Set<string>();
  for (const id of body.recordIds) {
    if (typeof id !== "string" || id.length !== 36 || !collectionOfflineRecordId.test(id) || ids.has(id.toLowerCase())) {
      throw badRequest("Pilihan mengandungi ID tidak sah atau berulang.", "BAD_REQUEST");
    }
    ids.add(id.toLowerCase());
  }
  const expected = new Map<string, CollectionOfflineExportExpectation>();
  if ("expected" in body) {
    const invalid = () => badRequest("Anggaran perlu sepadan dengan rekod yang dipilih.", "BAD_REQUEST");
    if (!Array.isArray(body.expected) || body.expected.length !== ids.size) throw invalid();
    for (const entry of body.expected) {
      if (!entry || typeof entry !== "object" || Object.keys(entry).length !== 3 || typeof entry.id !== "string" ||
          !isNonNegativeInteger(entry.cents) || !isNonNegativeInteger(entry.receipts)) throw invalid();
      const id = entry.id.toLowerCase();
      if (!ids.has(id) || expected.has(id)) throw invalid();
      expected.set(id, { id, cents: entry.cents, receipts: entry.receipts });
    }
  }
  return { ids: [...ids], expected };
}

function verifyExpectedTotals(records: CollectionRecord[], expected: Map<string, CollectionOfflineExportExpectation>) {
  if (!expected.size) return;
  const changes: CollectionOfflineExportExpectation[] = [];
  for (const record of records) {
    const cents = parseCollectionAmountToCents(record.amount, { allowZero: true });
    const receipts = getOfflineExportReceipts(record).length;
    if (cents === null) {
      throw new HttpError(409, "Amaun rekod tidak dapat disahkan.", { code: "CONFLICT" });
    }
    const preview = expected.get(record.id);
    if (preview?.cents !== cents || preview.receipts !== receipts) changes.push({ id: record.id, cents, receipts });
  }
  if (changes.length) throw new HttpError(409, "Jumlah bayaran atau bilangan resit telah berubah. Semak sebelum meneruskan.", {
    code: "OFFLINE_EXPORT_SELECTION_CHANGED", details: { changes },
  });
}

export function registerCollectionOfflineExportRoute({ app, storage, superuserReportAccess, jsonRoute }: CollectionRouteContext) {
  const active = new Set<string>();
  const starts = new Map<string, number[]>();
  app.get("/api/collection/export-selected-offline/records/:id", ...superuserReportAccess, (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  }, jsonRoute("Butiran rekod tidak dapat dimuat.", async req => {
    const user = req.user;
    if (!user?.userId || user.role !== "superuser" || !isCollectionAccessUserSnapshotUsable(user)) throw forbidden();
    const rawId = req.params.id;
    if (typeof rawId !== "string" || rawId.length !== 36 || !collectionOfflineRecordId.test(rawId)) throw badRequest("ID rekod tidak sah.", "BAD_REQUEST");
    const id = rawId.toLowerCase();
    const [record] = await storage.listCollectionRecords({ selectedRecordIds: [id], limit: 1 });
    if (!record || record.id !== id || !await canUserAccessCollectionRecord(storage, user, record)) throw notFound();
    await storage.createAuditLog({ action: "view_offline_export_record", performedBy: user.userId, targetResource: "collection",
      details: JSON.stringify({ recordId: id }) });
    // Return the same detail fields as the records dialog, without disclosing storage locations or retired receipts.
    const receipts = record.receipts.filter(r => r.collectionRecordId === id && !r.deletedAt).map((r, index) => ({
      ...r, originalFileName: path.win32.basename(r.originalFileName) || `Resit ${index + 1}`,
      storagePath: r.id === id ? `/api/collection/${id}/receipt/view` : `/api/collection/${id}/receipts/${encodeURIComponent(r.id)}/view`,
      fileHash: null,
    }));
    const { sourceObligationKey: _obligation, settlementCycleKey: _cycle, ...details } = record;
    return { ok: true, record: { ...details, receiptFile: null, archivedReceipts: [], receipts } };
  }));
  app.post("/api/collection/export-selected-offline", ...superuserReportAccess, async (req: AuthenticatedRequest, res: Response) => {
    const started = Date.now();
    const user = req.user;
    const actor = user?.userId;
    let selectedCount = 0;
    let receiptCount = 0;
    let slot = false;
    let directory: string | undefined;
    let archive: string | undefined;
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableFinished) controller.abort(); };
    res.once("close", disconnected);
    const timer = setTimeout(() => controller.abort(new HttpError(504, "Eksport mengambil masa terlalu lama. Kurangkan pilihan.", { code: "REQUEST_TIMEOUT", expose: true })), 120_000);
    timer.unref();
    async function audit(outcome: string) {
      if (!actor) return;
      await storage.createAuditLog({
        action: "export_selected_offline", performedBy: actor, targetResource: "collection",
        details: JSON.stringify({ actorId: actor, timestamp: new Date().toISOString(), selectedCount, receiptCount, outcome, durationMs: Date.now() - started }),
      });
    }
    res.setHeader("Cache-Control", "private, no-store");
    try {
      if (!actor || user.role !== "superuser" || !isCollectionAccessUserSnapshotUsable(user)) throw forbidden();
      const { ids, expected } = parseSelection(req.body);
      selectedCount = ids.length;
      for (const [key, times] of starts) {
        const recent = times.filter(time => time > started - 60_000);
        if (recent.length) starts.set(key, recent);
        else starts.delete(key);
      }
      const recent = starts.get(actor) ?? [];
      if (active.has(actor) || active.size >= 2 || recent.length >= 4) {
        res.setHeader("Retry-After", "60");
        throw new HttpError(429, "Eksport sedang sibuk. Cuba lagi sebentar.", { code: "RATE_LIMITED" });
      }
      active.add(actor);
      slot = true;
      starts.set(actor, [...recent, started]);
      const records = await storage.listCollectionRecords({ selectedRecordIds: ids, limit: ids.length });
      const byId = new Map(records.map(record => [record.id, record]));
      const ordered = [];
      const unavailableIds = [];
      for (const id of ids) {
        const record = byId.get(id);
        if (record && await canUserAccessCollectionRecord(storage, user, record)) ordered.push(record);
        else unavailableIds.push(id);
      }
      if (unavailableIds.length) throw new HttpError(409, "Sebahagian pilihan sudah tidak tersedia. Semak pilihan dan cuba lagi.", {
        code: "OFFLINE_EXPORT_RECORDS_UNAVAILABLE", details: { unavailableIds },
      });
      verifyExpectedTotals(ordered, expected);
      controller.signal.throwIfAborted();
      directory = await mkdtemp(path.join(tmpdir(), "sqr-collection-export-"));
      const result = await createCollectionOfflineArchive(ordered, directory, controller.signal);
      archive = result.path;
      receiptCount = result.receiptCount;
      // Persist the disclosure audit before sending any private bytes.
      await audit("prepared");
      controller.signal.throwIfAborted();
      const handle = await open(archive, "r");
      try {
        const stat = await handle.stat();
        const filename = path.basename(archive);
        if (process.platform !== "win32") {
          await unlink(archive);
          archive = undefined;
        }
        res.type("application/zip").set({
          "Content-Disposition": 'attachment; filename="' + filename + '"',
          "Content-Length": String(stat.size), "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no",
        });
        await pipeline(handle.createReadStream(), res, { signal: controller.signal });
      } finally {
        await handle.close();
      }
      await audit("downloaded");
    } catch (caught) {
      const reason = controller.signal.reason instanceof HttpError ? controller.signal.reason : caught;
      const error = reason instanceof HttpError ? reason : new HttpError(500, "Eksport gagal disediakan. Cuba lagi.", { code: "INTERNAL_ERROR" });
      try {
        await audit(controller.signal.aborted ? "cancelled" : error.code ?? "failed");
      } catch {
        logger.error("Offline collection export audit unavailable");
      }
      if (!res.headersSent && !res.destroyed) {
        res.removeHeader("Content-Length");
        res.removeHeader("Content-Disposition");
        res.status(error.statusCode).json({ ok: false, message: error.message, error: { code: error.code, message: error.message, details: error.details } });
      }
    } finally {
      clearTimeout(timer);
      res.off("close", disconnected);
      try {
        if (archive) await unlink(archive);
        if (directory) await rmdir(directory);
      } catch {
        logger.error("Offline collection export temporary cleanup failed");
      } finally {
        if (slot && actor) active.delete(actor);
      }
    }
  });
}
