import path from "path";
import { PDFParse } from "pdf-parse";
import Tesseract from "tesseract.js";
import {
  normalizeCollectionReceiptExtractionStatus,
  parseCollectionAmountToCents,
  type CollectionReceiptExtractionStatus,
} from "./collection-receipt-validation";

const RECEIPT_AMOUNT_REGEX =
  /\b(?:rm\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b(?:rm\s*)?\d+(?:\.\d{1,2})\b/gi;
const POSITIVE_KEYWORD_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\bgrand\s+total\b/i, score: 22 },
  { pattern: /\bjumlah\s+(?:bayaran|keseluruhan|akhir)\b/i, score: 20 },
  { pattern: /\btotal\s+(?:paid|payment|amount|due)\b/i, score: 18 },
  { pattern: /\bjumlah\b/i, score: 14 },
  { pattern: /\bbayaran\b/i, score: 14 },
  { pattern: /\bamount\b/i, score: 10 },
  { pattern: /\btotal\b/i, score: 10 },
];
const NEGATIVE_KEYWORD_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\bsubtotal\b/i, score: 6 },
  { pattern: /\bchange\b/i, score: 10 },
  { pattern: /\bdiscount\b/i, score: 8 },
  { pattern: /\btax\b/i, score: 5 },
  { pattern: /\bsst\b/i, score: 5 },
  { pattern: /\bservice\b/i, score: 4 },
  { pattern: /\bqty\b/i, score: 4 },
  { pattern: /\bitem\b/i, score: 4 },
  { pattern: /\bunit\b/i, score: 3 },
];
const OCR_TIMEOUT_MS = Math.max(
  3_000,
  Number.parseInt(String(process.env.COLLECTION_RECEIPT_OCR_TIMEOUT_MS || "15000"), 10) || 15_000,
);
const OCR_MIN_IMAGE_EDGE_PX = Math.max(
  32,
  Number.parseInt(String(process.env.COLLECTION_RECEIPT_OCR_MIN_IMAGE_EDGE_PX || "64"), 10) || 64,
);
const OCR_ENABLED = String(process.env.COLLECTION_RECEIPT_OCR_ENABLED || "1").trim() !== "0";
const OCR_LANG = String(process.env.COLLECTION_RECEIPT_OCR_LANG || "eng").trim() || "eng";
const OCR_CACHE_PATH = path.resolve(
  process.cwd(),
  String(process.env.COLLECTION_RECEIPT_OCR_CACHE_PATH || "var/tesseract-cache"),
);

Tesseract.setLogging(false);

export type CollectionReceiptExtractedAmountCandidate = {
  amountCents: number;
  line: string;
  matchedText: string;
  score: number;
};

export type CollectionReceiptExtractionResult = {
  extractedAmountCents: number | null;
  extractionStatus: CollectionReceiptExtractionStatus;
  extractionConfidence: number | null;
  extractionMessage: string | null;
};

function normalizeExtractedReceiptText(text: string): string[] {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 300);
}

function sanitizeReceiptAmountMatch(rawValue: string): string {
  return String(rawValue || "")
    .replace(/\brm\b/gi, "")
    .replace(/\s+/g, "")
    .trim();
}

function scoreReceiptAmountCandidate(line: string, rawValue: string): number {
  let score = 10;
  const normalizedLine = String(line || "");
  if (/rm/i.test(rawValue)) {
    score += 4;
  }
  if (/\.\d{2}\b/.test(rawValue)) {
    score += 3;
  }
  for (const rule of POSITIVE_KEYWORD_PATTERNS) {
    if (rule.pattern.test(normalizedLine)) {
      score += rule.score;
    }
  }
  for (const rule of NEGATIVE_KEYWORD_PATTERNS) {
    if (rule.pattern.test(normalizedLine)) {
      score -= rule.score;
    }
  }
  return score;
}

export function extractCollectionReceiptAmountCandidates(
  text: string,
): CollectionReceiptExtractedAmountCandidate[] {
  const lines = normalizeExtractedReceiptText(text);
  const candidates: CollectionReceiptExtractedAmountCandidate[] = [];

  for (const line of lines) {
    const matches = line.matchAll(RECEIPT_AMOUNT_REGEX);
    for (const match of matches) {
      const matchedText = String(match[0] || "").trim();
      const amountCents = parseCollectionAmountToCents(
        sanitizeReceiptAmountMatch(matchedText),
        { allowZero: false, allowEmpty: true },
      );
      if (amountCents === null) {
        continue;
      }
      candidates.push({
        amountCents,
        line,
        matchedText,
        score: scoreReceiptAmountCandidate(line, matchedText),
      });
    }
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.amountCents !== left.amountCents) {
      return right.amountCents - left.amountCents;
    }
    return left.line.localeCompare(right.line);
  });
}

export function buildCollectionReceiptExtractionResultFromText(
  text: string,
): CollectionReceiptExtractionResult {
  const candidates = extractCollectionReceiptAmountCandidates(text);
  const primary = candidates[0];
  const secondary = candidates[1];

  if (!primary) {
    return {
      extractedAmountCents: null,
      extractionStatus: "unavailable",
      extractionConfidence: null,
      extractionMessage: "OCR/PDF text tidak menemui jumlah resit yang meyakinkan.",
    };
  }

  if (!secondary) {
    return {
      extractedAmountCents: primary.amountCents,
      extractionStatus: "suggested",
      extractionConfidence: 0.92,
      extractionMessage: `Cadangan OCR/PDF diambil daripada "${primary.line}".`,
    };
  }

  const scoreGap = primary.score - secondary.score;
  const sameAmount = primary.amountCents === secondary.amountCents;
  if (scoreGap >= 5 || sameAmount) {
    return {
      extractedAmountCents: primary.amountCents,
      extractionStatus: "suggested",
      extractionConfidence: sameAmount ? 0.86 : 0.8,
      extractionMessage: `Cadangan OCR/PDF paling kuat diambil daripada "${primary.line}".`,
    };
  }

  return {
    extractedAmountCents: primary.amountCents,
    extractionStatus: "ambiguous",
    extractionConfidence: 0.52,
    extractionMessage: "OCR/PDF menemui beberapa jumlah yang hampir serupa. Sila semak semula jumlah resit.",
  };
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return String(result.text || "");
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await Tesseract.createWorker(OCR_LANG, 1, {
    cachePath: OCR_CACHE_PATH,
    logger: undefined,
  });
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Receipt OCR timed out after ${OCR_TIMEOUT_MS}ms.`));
      }, OCR_TIMEOUT_MS);
    });
    const recognizePromise = worker.recognize(buffer);
    const result = await Promise.race([recognizePromise, timeoutPromise]);
    return String(result.data?.text || "");
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    await worker.terminate().catch(() => undefined);
  }
}

export async function extractCollectionReceiptSuggestion(params: {
  buffer: Buffer;
  mimeType: string;
  imageWidth?: number;
  imageHeight?: number;
}): Promise<CollectionReceiptExtractionResult> {
  if (!OCR_ENABLED) {
    return {
      extractedAmountCents: null,
      extractionStatus: "unprocessed",
      extractionConfidence: null,
      extractionMessage: "OCR receipt dimatikan untuk runtime semasa.",
    };
  }

  const mimeType = String(params.mimeType || "").trim().toLowerCase();

  try {
    if (mimeType === "application/pdf") {
      const extractedText = await extractTextFromPdfBuffer(params.buffer);
      return buildCollectionReceiptExtractionResultFromText(extractedText);
    }

    if (mimeType.startsWith("image/")) {
      const imageWidth = Number(params.imageWidth || 0);
      const imageHeight = Number(params.imageHeight || 0);
      if (
        (Number.isFinite(imageWidth) && imageWidth > 0 && imageWidth < OCR_MIN_IMAGE_EDGE_PX)
        || (Number.isFinite(imageHeight) && imageHeight > 0 && imageHeight < OCR_MIN_IMAGE_EDGE_PX)
      ) {
        return {
          extractedAmountCents: null,
          extractionStatus: "unavailable",
          extractionConfidence: null,
          extractionMessage: "Imej resit terlalu kecil untuk OCR yang boleh dipercayai.",
        };
      }

      const extractedText = await extractTextFromImageBuffer(params.buffer);
      return buildCollectionReceiptExtractionResultFromText(extractedText);
    }
  } catch (error) {
    const message = String((error as { message?: string })?.message || "").trim();
    return {
      extractedAmountCents: null,
      extractionStatus: "error",
      extractionConfidence: null,
      extractionMessage: message || "OCR/PDF extraction gagal dijalankan.",
    };
  }

  return {
    extractedAmountCents: null,
    extractionStatus: normalizeCollectionReceiptExtractionStatus(null),
    extractionConfidence: null,
    extractionMessage: "Jenis fail resit ini tidak menyokong extraction automatik.",
  };
}
