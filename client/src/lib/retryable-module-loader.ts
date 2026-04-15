export function createRetryableModuleLoader<TModule>(
  factory: () => Promise<TModule>,
): () => Promise<TModule> {
  let cachedPromise: Promise<TModule> | null = null;

  return () => {
    if (!cachedPromise) {
      cachedPromise = factory().catch((error) => {
        cachedPromise = null;
        throw error;
      });
    }

    return cachedPromise;
  };
}
