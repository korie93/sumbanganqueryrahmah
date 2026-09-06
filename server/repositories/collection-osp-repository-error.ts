export class CollectionOspV7RepositoryError extends Error {
  constructor(
    readonly reason: "NOT_FOUND" | "DELETED" | "VERSION_CONFLICT" | "DUPLICATE"
      | "INVALID_SOURCE" | "BASELINE_MISMATCH" | "PII_UNAVAILABLE" | "DATASET_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "CollectionOspV7RepositoryError";
  }
}
