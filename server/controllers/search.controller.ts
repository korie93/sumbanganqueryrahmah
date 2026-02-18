import { Request, Response } from "express";
import { PostgresStorage } from "../storage-postgres";

const storage = new PostgresStorage();

export async function searchGlobal(req: Request, res: Response) {
  try {
    const search = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = (page - 1) * limit;

    console.log(`🔍 searchGlobal called: search="${search}", page=${page}, limit=${limit}`);

    if (search.length < 2) {
      console.log(`⚠️ Search query too short (${search.length} chars), returning empty results`);
      return res.json({ columns: [], rows: [], results: [], total: 0, page, limit });
    }

    const result = await storage.searchGlobalDataRows({ search, limit, offset });
    console.log(`📊 searchGlobalDataRows returned: ${result.rows?.length || 0} rows, total=${result.total}`);

    // Flatten and add __rowId
    const safeRows = result.rows || [];
    const rows = safeRows.map((r: any) => {
      let jsonData = r.jsonDataJsonb;
      
      // Parse if it's a string (JSON stored as text)
      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch (e) {
          console.warn(`⚠️ Failed to parse jsonData for row ${r.id}, treating as string`);
          jsonData = { raw: jsonData };
        }
      }
      
      const sourceFile = r.importFilename || r.importName || "";
      return {
        __rowId: r.id,
        ...jsonData,
        "Source File": sourceFile,
      };
    });

    // Extract all unique columns (excluding __rowId)
    const columnSet = new Set<string>();
    rows.forEach((row: any) => {
      Object.keys(row).forEach((k) => {
        if (k !== "__rowId") {
          columnSet.add(k);
        }
      });
    });

    console.log(`✅ Extracted ${columnSet.size} columns: ${Array.from(columnSet).slice(0, 5).join(", ")}...`);

    return res.json({
      columns: Array.from(columnSet),
      rows,
      results: rows,
      total: result.total || 0,
      page,
      limit,
    });
  } catch (err: any) {
    console.error("❌ ERROR in searchGlobal:", err);
    return res.status(500).json({ message: err.message });
  }
}

export async function advancedSearch(req: Request, res: Response) {
  try {
    const { filters, logic, page = 1, limit = 50 } = req.body;
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(Number(limit), 200);
    const offset = (safePage - 1) * safeLimit;

    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ message: "Filters are required" });
    }

    const result = await storage.advancedSearchDataRows(filters, logic || "AND", safeLimit, offset);
    const importsList = await storage.getImports();
    const importMap = new Map(importsList.map((imp) => [imp.id, imp]));

    const safeRows = result.rows || [];
    const rowsData = safeRows.map((row: any) => {
      let jsonData = row.jsonDataJsonb;
      
      // Parse if it's a string (JSON stored as text)
      if (typeof jsonData === "string") {
        try {
          jsonData = JSON.parse(jsonData);
        } catch (e) {
          console.warn(`⚠️ Failed to parse jsonData for row ${row.id}`);
          jsonData = {};
        }
      } else if (!jsonData || typeof jsonData !== "object") {
        jsonData = {};
      }
      
      const imp = importMap.get(row.importId);
      const sourceFile = imp?.filename || imp?.name || "";
      return {
        __rowId: row.id,
        ...jsonData,
        "Source File": sourceFile,
      };
    });

    // Extract all unique headers
    const headerSet = new Set<string>();
    rowsData.forEach((row: any) => {
      Object.keys(row).forEach((key) => {
        if (key !== "__rowId") {
          headerSet.add(key);
        }
      });
    });

    return res.json({
      rows: rowsData,
      results: rowsData, // For frontend compatibility
      headers: Array.from(headerSet),
      total: result.total || 0,
      page: safePage,
      limit: safeLimit,
    });
  } catch (err: any) {
    console.error("❌ ERROR in advancedSearch:", err);
    return res.status(500).json({ message: err.message });
  }
}

export async function getSearchColumns(req: Request, res: Response) {
  try {
    const columns = await storage.getAllColumnNames();
    return res.json(columns);
  } catch (err: any) {
    console.error("❌ ERROR in getSearchColumns:", err);
    return res.status(500).json({ message: err.message });
  }
}
