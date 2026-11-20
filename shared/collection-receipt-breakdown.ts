import { z } from "zod";

const amount = z.string().regex(/^\d+\.\d{2}$/);
const suffix = z.string().regex(/^\d{4}$/).nullable();
const receiptLink = z.object({
  recordId: z.string().min(1),
  batch: z.string(),
  paymentDate: z.string(),
  accountLast4: suffix,
  cardLast4: suffix,
});
export type CollectionReceiptLink = z.infer<typeof receiptLink>;
export const collectionReceiptBreakdownSchema = z.object({
  ok: z.literal(true),
  recordedAmount: amount,
  totalDue: amount.nullable(),
  sharedAmount: amount.nullable(),
  uniqueAmount: amount.nullable(),
  unclassifiedCount: z.number().int().nonnegative(),
  receiptCount: z.number().int().nonnegative(),
  sharedReceipts: z.array(z.object({
    id: z.string(),
    fileName: z.string(),
    amount: amount.nullable(),
    related: z.object({ count: z.number().int().positive(), records: z.array(receiptLink) }).optional(),
  })),
});
export type CollectionReceiptBreakdown = z.infer<typeof collectionReceiptBreakdownSchema>;

const comparisonEntry = z.object({
  batch: z.string(),
  paymentDate: z.string(),
  recordedAmount: amount,
  receiptAmount: amount.nullable(),
  fileName: z.string(),
});
export const collectionReceiptComparisonSchema = z.object({
  original: comparisonEntry,
  related: comparisonEntry,
});
export type CollectionReceiptComparison = z.infer<typeof collectionReceiptComparisonSchema>;
