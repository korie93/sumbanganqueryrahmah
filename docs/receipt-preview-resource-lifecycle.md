# Receipt preview resource lifecycle

The active image's source is set and cleared in a client layout effect. On preview component unmount or keyed source replacement, its cleanup runs before React removes the image from the document. Passive cleanup after removal reproduced retained image/dialog subtrees during repeated receipt previews in isolated Chromium tests.

Setup and cleanup remain symmetric: development StrictMode replay restores the active source, source replacement clears the previous image, and unmount removes its `src` attribute. Server rendering uses a passive effect. The receipt hook continues to own blob URL revocation and request cancellation; image cleanup does not assign an empty URL or change zoom, rotation, PDF handling, download permissions, or navigation.

An internal decode-error fallback replaces the image while the preview component remains mounted. That existing path still releases the captured image source when the component later unmounts; this change does not claim to alter its earlier removal ordering.

`tests/visual/receipt-preview-resource-lifecycle.spec.ts` checks real lifecycle ordering and StrictMode/source replacement behavior. This is separate from memory profiling: forced garbage collection and synthetic Linux Chromium readings do not predict Windows Chrome Task Manager RAM. Native image caches and allocator pages may remain after closed previews even when DOM references are released.
