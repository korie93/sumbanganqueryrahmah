import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { getAuditHmacKey } from "../config/security";
import { safeJsonParse } from "../lib/safe-json";

const TOKEN_PREFIX = "sch1";
const TOKEN_AAD = Buffer.from("sqr:general-search:collection-history:v1", "utf8");
const TOKEN_MAX_LENGTH = 1_024;
const SOURCE_ID_MAX_LENGTH = 200;

export type SearchCollectionHistoryIdentity = {
  sourceDataRowId: string;
  sourceImportId: string;
};

function getHistoryTokenEncryptionKey(): Buffer {
  return createHmac("sha256", getAuditHmacKey())
    .update("sqr-general-search-collection-history-token-key-v1", "utf8")
    .digest();
}

function normalizeIdentity(
  value: SearchCollectionHistoryIdentity,
): SearchCollectionHistoryIdentity | null {
  const sourceImportId = String(value.sourceImportId || "").trim();
  const sourceDataRowId = String(value.sourceDataRowId || "").trim();
  if (
    !sourceImportId
    || !sourceDataRowId
    || sourceImportId.length > SOURCE_ID_MAX_LENGTH
    || sourceDataRowId.length > SOURCE_ID_MAX_LENGTH
  ) {
    return null;
  }
  return { sourceDataRowId, sourceImportId };
}

/**
 * The browser receives only this authenticated ciphertext, never account/card
 * lookup values or a caller-controlled database identifier pair.
 */
export function encodeSearchCollectionHistoryKey(
  value: SearchCollectionHistoryIdentity,
): string {
  const identity = normalizeIdentity(value);
  if (!identity) {
    throw new Error("Cannot create a collection history key without a valid source identity.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getHistoryTokenEncryptionKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const plaintext = Buffer.from(JSON.stringify({
    i: identity.sourceImportId,
    r: identity.sourceDataRowId,
    v: 1,
  }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    TOKEN_PREFIX,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decodeSearchCollectionHistoryKey(
  value: unknown,
): SearchCollectionHistoryIdentity | null {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || token.length > TOKEN_MAX_LENGTH) return null;

  const [prefix, ivRaw, ciphertextRaw, tagRaw, extra] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !ivRaw || !ciphertextRaw || !tagRaw || extra !== undefined) {
    return null;
  }

  try {
    const iv = Buffer.from(ivRaw, "base64url");
    const ciphertext = Buffer.from(ciphertextRaw, "base64url");
    const tag = Buffer.from(tagRaw, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", getHistoryTokenEncryptionKey(), iv);
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const parseResult = safeJsonParse<unknown>(
      plaintext,
      "search_collection_history_key",
      {
        logFailures: false,
        maxArrayLength: 1,
        maxDepth: 2,
        maxObjectKeys: 4,
        maxRawBytes: 768,
        maxStringLength: SOURCE_ID_MAX_LENGTH,
        maxTotalBytes: 768,
      },
    );
    if (
      !parseResult.success
      || !parseResult.data
      || typeof parseResult.data !== "object"
      || Array.isArray(parseResult.data)
    ) {
      return null;
    }
    const parsed = parseResult.data as Record<string, unknown>;
    if (parsed.v !== 1) return null;
    return normalizeIdentity({
      sourceImportId: typeof parsed.i === "string" ? parsed.i : "",
      sourceDataRowId: typeof parsed.r === "string" ? parsed.r : "",
    });
  } catch {
    return null;
  }
}
