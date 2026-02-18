import { Request, Response } from "express";
import { PostgresStorage } from "../storage-postgres";

const storage = new PostgresStorage();

/**
 * GET /api/imports
 */
export async function getImports(req: Request, res: Response) {
  try {
    const imports = await storage.getImports();

    const importsWithCount = await Promise.all(
      imports.map(async (imp) => {
        const rowCount = await storage.getDataRowCountByImport(imp.id);
        return { ...imp, rowCount };
      })
    );

    return res.json({ imports: importsWithCount });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

/**
 * GET /api/imports/:id/data
 * 🔥 ENDPOINT KRITIKAL (VIEWER)
 */
export async function getImportData(req: Request, res: Response) {
  try {
    const importId = req.params.id;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = (page - 1) * limit;
    const search = String(req.query.q || "").trim();

    console.log(`📥 getImportData called: importId=${importId}, page=${page}, limit=${limit}, search=${search}`);

    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }

    const result = await storage.searchDataRows({
      importId,
      search: search || null,
      limit,
      offset,
    });

    console.log(`📤 searchDataRows returned: ${result.rows?.length || 0} rows, total=${result.total}`);

    // Return rows in format expected by viewer - with jsonDataJsonb property intact
    // Viewer will extract row.jsonDataJsonb and flatten it
    const safeRows = result.rows || [];
    const formattedRows = safeRows.map((row: any) => ({
      id: row.id,
      importId: row.importId,
      jsonDataJsonb: row.jsonDataJsonb,
    }));

    console.log(`📤 Sending ${formattedRows.length} formatted rows to client`);
    if (formattedRows.length > 0) {
      console.log(`📤 First formatted row:`, JSON.stringify(formattedRows[0], null, 2).substring(0, 300));
    }

    const response = {
      rows: formattedRows,
      total: result.total || 0,
      page,
      limit,
    };
    
    console.log(`📤 Final response total: ${response.total}, rows.length: ${response.rows.length}`);
    
    return res.json(response);
  } catch (err: any) {
    console.error("❌ ERROR in getImportData:", err.message, err.stack);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
}

/**
 * GET /api/imports/:id/analyze
 */
export async function analyzeImport(req: Request, res: Response) {
  try {
    const importId = req.params.id;

    if (!importId) {
      return res.status(400).json({ message: "importId is required" });
    }

    const importData = await storage.getImportById(importId);
    if (!importData) {
      return res.status(404).json({ message: "Import not found" });
    }

    const rows = await storage.getDataRowsByImport(importId);
    
    // Basic analysis - count rows, no complex analysis for now
    return res.json({
      import: importData,
      totalRows: rows.length,
      analysis: {
        icLelaki: { count: 0, samples: [] },
        icPerempuan: { count: 0, samples: [] },
        noPolis: { count: 0, samples: [] },
        noTentera: { count: 0, samples: [] },
        passportMY: { count: 0, samples: [] },
        passportLuarNegara: { count: 0, samples: [] },
        duplicates: { count: 0, items: [] },
      },
    });
  } catch (err: any) {
    console.error("❌ ERROR in analyzeImport:", err.message);
    return res.status(500).json({ message: err.message || "Failed to analyze import" });
  }
}

/**
 * GET /api/analyze/all
 */
export async function analyzeAll(req: Request, res: Response) {
  try {
    const imports = await storage.getImports();

    let totalRows = 0;
    const importsData = [];

    for (const imp of imports) {
      const rows = await storage.getDataRowsByImport(imp.id);
      totalRows += rows.length;
      importsData.push({
        id: imp.id,
        name: imp.name,
        filename: imp.filename,
        rowCount: rows.length,
      });
    }

    return res.json({
      totalImports: imports.length,
      totalRows,
      imports: importsData,
      analysis: {
        icLelaki: { count: 0, samples: [] },
        icPerempuan: { count: 0, samples: [] },
        noPolis: { count: 0, samples: [] },
        noTentera: { count: 0, samples: [] },
        passportMY: { count: 0, samples: [] },
        passportLuarNegara: { count: 0, samples: [] },
        duplicates: { count: 0, items: [] },
      },
    });
  } catch (err: any) {
    console.error("❌ ERROR in analyzeAll:", err.message);
    return res.status(500).json({ message: err.message || "Failed to analyze all imports" });
  }
}
