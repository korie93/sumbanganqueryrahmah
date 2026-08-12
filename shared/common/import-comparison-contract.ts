import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nonNegativeIntSchema = z.number().int().nonnegative();
const positiveIntSchema = z.number().int().positive();

export const importComparisonCategorySchema = z.enum([
  "all",
  "matched",
  "account_changed",
  "baseline_only",
  "current_only",
  "conflict",
  "unidentified",
]);

export const importComparisonMatchBasisSchema = z.enum([
  "ic",
  "account",
  "phone_and_name",
  "none",
]);

export const importComparisonSourceSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  rowCount: nonNegativeIntSchema,
});

export const importComparisonSideSchema = z.object({
  customerName: z.string().nullable(),
  icNumber: z.string().nullable(),
  customerPhone: z.string().nullable(),
  accountNumbers: z.array(z.string()).max(8),
  occurrences: positiveIntSchema,
});

export const importComparisonItemSchema = z.object({
  id: nonEmptyStringSchema,
  category: importComparisonCategorySchema.exclude(["all"]),
  matchBasis: importComparisonMatchBasisSchema,
  baseline: importComparisonSideSchema.nullable(),
  current: importComparisonSideSchema.nullable(),
});

export const importComparisonSummarySchema = z.object({
  baselineIdentities: nonNegativeIntSchema,
  currentIdentities: nonNegativeIntSchema,
  matched: nonNegativeIntSchema,
  accountChanged: nonNegativeIntSchema,
  baselineOnly: nonNegativeIntSchema,
  currentOnly: nonNegativeIntSchema,
  conflicts: nonNegativeIntSchema,
  unidentified: nonNegativeIntSchema,
  baselineDuplicateRows: nonNegativeIntSchema,
  currentDuplicateRows: nonNegativeIntSchema,
});

export const importComparisonResponseSchema = z.object({
  baseline: importComparisonSourceSchema,
  current: importComparisonSourceSchema,
  summary: importComparisonSummarySchema,
  items: z.array(importComparisonItemSchema),
  pagination: z.object({
    mode: z.literal("offset"),
    page: positiveIntSchema,
    pageSize: positiveIntSchema,
    total: nonNegativeIntSchema,
    totalPages: positiveIntSchema,
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  matching: z.object({
    strategy: z.literal("deterministic_customer_account_v1"),
    identifiers: z.array(importComparisonMatchBasisSchema),
  }),
});

export type ImportComparisonCategory = z.infer<typeof importComparisonCategorySchema>;
export type ImportComparisonItem = z.infer<typeof importComparisonItemSchema>;
export type ImportComparisonResponse = z.infer<typeof importComparisonResponseSchema>;
export type ImportComparisonSide = z.infer<typeof importComparisonSideSchema>;
