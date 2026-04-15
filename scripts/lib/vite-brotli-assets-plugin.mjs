import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

export const DEFAULT_BROTLI_MINIMUM_SIZE_BYTES = 1024;
export const DEFAULT_BROTLI_COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

function resolveOutputDir(resolvedConfig, outputOptions) {
  if (outputOptions.dir) {
    return path.resolve(resolvedConfig.root, outputOptions.dir);
  }

  return path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
}

function readBundleEntrySource(bundleEntry) {
  if ("code" in bundleEntry) {
    return Buffer.from(bundleEntry.code, "utf8");
  }

  if (Buffer.isBuffer(bundleEntry.source)) {
    return bundleEntry.source;
  }

  return Buffer.from(String(bundleEntry.source), "utf8");
}

export function shouldEmitBrotliAsset(
  fileName,
  {
    compressibleExtensions = DEFAULT_BROTLI_COMPRESSIBLE_EXTENSIONS,
    minimumSizeBytes = DEFAULT_BROTLI_MINIMUM_SIZE_BYTES,
    sourceByteLength,
  } = {},
) {
  const extension = path.extname(fileName).toLowerCase();
  if (!compressibleExtensions.has(extension)) {
    return false;
  }

  if (typeof sourceByteLength === "number" && sourceByteLength < minimumSizeBytes) {
    return false;
  }

  return true;
}

export function createViteBrotliAssetsPlugin({
  minimumSizeBytes = DEFAULT_BROTLI_MINIMUM_SIZE_BYTES,
  compressibleExtensions = DEFAULT_BROTLI_COMPRESSIBLE_EXTENSIONS,
  quality = 11,
} = {}) {
  let resolvedConfig = null;

  return {
    name: "sqr-brotli-assets",
    apply: "build",
    configResolved(config) {
      resolvedConfig = config;
    },
    async writeBundle(outputOptions, bundle) {
      if (!resolvedConfig) {
        return;
      }

      const outputDir = resolveOutputDir(resolvedConfig, outputOptions);

      await Promise.all(
        Object.values(bundle).map(async (bundleEntry) => {
          const source = readBundleEntrySource(bundleEntry);
          if (
            !shouldEmitBrotliAsset(bundleEntry.fileName, {
              compressibleExtensions,
              minimumSizeBytes,
              sourceByteLength: source.byteLength,
            })
          ) {
            return;
          }

          const compressed = brotliCompressSync(source, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: quality,
            },
          });

          if (compressed.byteLength >= source.byteLength) {
            return;
          }

          const compressedFilePath = path.join(outputDir, `${bundleEntry.fileName}.br`);
          await mkdir(path.dirname(compressedFilePath), { recursive: true });
          await writeFile(compressedFilePath, compressed);
        }),
      );
    },
  };
}
