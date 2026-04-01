export function clearAppQueryCache() {
  void import("./queryClient")
    .then(({ queryClient }) => {
      queryClient.clear();
    })
    .catch(() => {
      // Ignore on-demand cache clear failures; logout flow should not block on a lazy chunk.
    });
}
