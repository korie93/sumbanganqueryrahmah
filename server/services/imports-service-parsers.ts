import { ensureObject } from "../http/validation";
import { jsonObjectSchema } from "../../shared/json-schema";
import type {
  CreateImportBody,
  ImportDataPageCursor,
  NormalizeImportRowResult,
  RenameImportBody,
} from "./imports-service-types";

export function encodeImportDataPageCursor(cursor: ImportDataPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseImportDataPageCursor(
  rawCursor: string | null | undefined,
): ImportDataPageCursor | null {
  const normalized = String(rawCursor || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(normalized, "base64url").toString("utf8"),
    ) as Partial<ImportDataPageCursor>;
    const lastRowId = String(parsed.lastRowId || "").trim();
    const page = Number.isFinite(Number(parsed.page)) ? Math.trunc(Number(parsed.page)) : 0;
    if (!lastRowId || page < 2) {
      return null;
    }

    return {
      lastRowId,
      page,
    };
  } catch {
    return null;
  }
}

export function parseCreateImportBody(bodyRaw: unknown): CreateImportBody {
  const body = ensureObject(bodyRaw) || {};
  const name = String(body.name ?? "");
  const filename = String(body.filename ?? "");
  const dataRows = Array.isArray(body.rows) ? body.rows : (Array.isArray(body.data) ? body.data : []);

  return {
    name,
    filename,
    dataRows,
  };
}

export function parseRenameBody(bodyRaw: unknown): RenameImportBody {
  const body = ensureObject(bodyRaw) || {};
  return {
    name: String(body.name ?? ""),
  };
}

export function normalizeImportRow(row: unknown): NormalizeImportRowResult {
  const normalized = ensureObject(row);
  if (!normalized) {
    throw new Error("Invalid jsonDataJsonb");
  }

  const parsed = jsonObjectSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error("Invalid jsonDataJsonb");
  }

  return parsed.data;
}
