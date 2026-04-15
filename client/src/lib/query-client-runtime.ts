import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";

const loadQueryClientModule = createRetryableModuleLoader<typeof import("./queryClient")>(
  () => import("./queryClient"),
);

export function clearAppQueryCache() {
  void loadQueryClientModule()
    .then(({ queryClient }) => {
      queryClient.clear();
    })
    .catch(() => {
      // Ignore on-demand cache clear failures; logout flow should not block on a lazy chunk.
    });
}
