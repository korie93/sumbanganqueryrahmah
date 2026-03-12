import type { Request, Response } from "express";
import { SearchRepository } from "../repositories/search.repository";

const searchRepository = new SearchRepository();

export async function searchGlobal(req: Request, res: Response) {
  try {
    const search = String(req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.max(10, Math.min(Number(req.query.limit ?? 50), 200));
    const offset = (page - 1) * limit;

    if (search.length < 2) {
      return res.json({ columns: [], rows: [], results: [], total: 0, page, limit });
    }

    const result = await searchRepository.searchGlobalDataRows({ search, limit, offset });
    const rows = (result.rows || []).map((row: any) => ({
      ...(row.jsonDataJsonb || {}),
      "Source File": row.importFilename || row.importName || "",
    }));

    const columns = Array.from(
      rows.reduce((set, row: Record<string, unknown>) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>()),
    );

    return res.json({
      columns,
      rows,
      results: rows,
      total: result.total || 0,
      page,
      limit,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Global search failed" });
  }
}

export async function advancedSearch(req: Request, res: Response) {
  try {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const logic = body.logic === "OR" ? "OR" : "AND";
    const page = Math.max(1, Number(body.page ?? 1));
    const limit = Math.max(10, Math.min(Number(body.limit ?? 50), 200));
    const offset = (page - 1) * limit;

    if (filters.length === 0) {
      return res.status(400).json({ message: "Filters are required" });
    }

    const result = await searchRepository.advancedSearchDataRows(filters, logic, limit, offset);
    const rows = (result.rows || []).map((row: any) => ({
      ...(row.jsonDataJsonb || {}),
      "Source File": row.importFilename || row.importName || "",
    }));

    const headers = Array.from(
      rows.reduce((set, row: Record<string, unknown>) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>()),
    );

    return res.json({
      rows,
      results: rows,
      headers,
      total: result.total || 0,
      page,
      limit,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Advanced search failed" });
  }
}

export async function getSearchColumns(_req: Request, res: Response) {
  try {
    return res.json(await searchRepository.getAllColumnNames());
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load search columns" });
  }
}
