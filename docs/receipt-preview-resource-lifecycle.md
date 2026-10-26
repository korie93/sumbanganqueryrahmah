# Receipt preview resource lifecycle

The active image's source is set and cleared in a client layout effect. On preview component unmount or keyed receipt replacement, its cleanup runs before React removes the image from the document. Passive cleanup after removal reproduced retained image/dialog subtrees during repeated receipt previews in isolated Chromium tests.

Setup and cleanup remain symmetric: development StrictMode replay restores the active source, receipt replacement cleans up the previous image, and unmount removes its `src` attribute. Updating the quality of the same receipt retains the mounted image. Server rendering uses a passive effect. The receipt hook continues to own blob URL revocation and request cancellation; image cleanup does not assign an empty URL or change zoom, rotation, PDF handling, download permissions, or navigation.

An internal decode-error fallback replaces the image while the preview component remains mounted. That existing path still releases the captured image source when the component later unmounts; this change does not claim to alter its earlier removal ordering.

`tests/visual/receipt-preview-resource-lifecycle.spec.ts` checks real lifecycle ordering and StrictMode/source replacement behavior. This is separate from memory profiling: forced garbage collection and synthetic Linux Chromium readings do not predict Windows Chrome Task Manager RAM. Native image caches and allocator pages may remain after closed previews even when DOM references are released.

## Adaptive image detail

An image opened below the shared 768px mobile breakpoint starts with a maximum edge of 1,280px and a 1,048,576-pixel budget. Desktop keeps the existing 1,600px / 1,800,000-pixel limits. The profile is captured when a receipt loads; resizing does not restart it. Small originals are never enlarged by optimization.

The first explicit zoom above fit requests the desktop detail profile for a compact image, using the same authenticated preview endpoint. The current image remains mounted during fetching/optimization. A synchronous request owner deduplicates further zoom clicks. A successful replacement preserves zoom/rotation and revokes the previous object URL. A failure leaves the existing image available and offers a separate retry. The original receipt is refetched only when needed; its bytes are not retained in a preview cache.

Close, receipt selection, a new record, retry and unmount abort or invalidate stale preparation. Late results cannot publish a URL for a different receipt. ImageBitmaps that finish decoding after cancellation are closed before rejection. PDF handling and original-file downloads retain their existing paths.

The Records page loads `ReceiptPreviewSession` only after a receipt is requested. This session owns the preview hook and dialog; the Records controller retains only the selected request until closing. Preparation and original-download code are loaded through `receipt-preview-image-detail.ts`. Downloads still use the original authenticated endpoint and bytes, with current-controller checks before requesting and before starting the browser download.

`tests/visual/receipt-adaptive-preview.spec.ts` exercises the real hook/dialog with synthetic images and controlled requests. The smaller pixel budget bounds the generated mobile preview; the original file still has to be fetched and decoded, so lower peak process RAM or a specific Chrome Task Manager reduction is not guaranteed.
