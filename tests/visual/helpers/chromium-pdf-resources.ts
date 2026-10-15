/** Browser-owned PDF UI, not an application or outbound network origin. */
export function isChromiumPdfViewerResource(url: URL): boolean {
  if (url.username || url.password || url.port) return false;
  return (url.protocol === "chrome-extension:"
    && url.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai")
    || (url.protocol === "chrome:" && url.hostname === "resources");
}
