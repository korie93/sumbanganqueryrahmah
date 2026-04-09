// Collection money units are intentionally split:
// - MYR string values are used for API/read models rendered to clients.
// - MYR number values are used for validated inputs and in-memory calculations.
// - cents values are integer minor units used by receipt/OCR/bigint storage paths.

export type CollectionAmountMyrString = string;
export type CollectionAmountMyrNumber = number;
export type CollectionAmountMyrLike = CollectionAmountMyrString | CollectionAmountMyrNumber;

export type CollectionAmountCents = number;
export type CollectionAmountCentsLike = string | CollectionAmountCents;
