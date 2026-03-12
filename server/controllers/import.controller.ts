import type { Request, Response } from "express";
import { ImportsRepository } from "../repositories/imports.repository";
import { ImportAnalysisService } from "../services/import-analysis.service";
import { PostgresStorage } from "../storage-postgres";

const storage = new PostgresStorage();
const importsRepository = new ImportsRepository();
const importAnalysisService = new ImportAnalysisService(importsRepository);

export async function getImports(_req: Request, res: Response) {
  try {
    return res.json({
      imports: await importsRepository.getImportsWithRowCounts(),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load imports" });
  }
}

export async function getImportData(req: Request, res: Response) {
  try {
    const importId = String(req.params.id || "");
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.max(10, Math.min(Number(req.query.limit ?? 100), 500));
    const offset = (page - 1) * limit;
    const search = String(req.query.q || "").trim();

    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }

    const result = await storage.searchDataRows({
      importId,
      search: search || null,
      limit,
      offset,
    });

    return res.json({
      rows: (result.rows || []).map((row: any) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      })),
      total: result.total || 0,
      page,
      limit,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Internal server error" });
  }
}

export async function analyzeImport(req: Request, res: Response) {
  try {
    const importId = String(req.params.id || "");
    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }

    const importRecord = await storage.getImportById(importId);
    if (!importRecord) {
      return res.status(404).json({ message: "Import not found" });
    }

    return res.json(await importAnalysisService.analyzeImport(importRecord));
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to analyze import" });
  }
}

export async function analyzeAll(_req: Request, res: Response) {
  try {
    return res.json(
      await importAnalysisService.analyzeAll(await importsRepository.getImportsWithRowCounts()),
    );
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to analyze all imports" });
  }
}
