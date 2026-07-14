import { build } from "esbuild";
import path from "node:path";
import {
  readReleaseManifest,
  RELEASE_MANIFEST_FILENAME,
} from "./lib/release-manifest.mjs";

const cwd = process.cwd();
const releaseManifest = readReleaseManifest(path.resolve(cwd, "dist-local", RELEASE_MANIFEST_FILENAME));
const releaseDefines = {
  __SQR_RELEASE_BUILT_AT__: JSON.stringify(releaseManifest.builtAt),
  __SQR_RELEASE_COMMIT_SHA__: JSON.stringify(releaseManifest.commitSha),
  __SQR_RELEASE_ID__: JSON.stringify(releaseManifest.releaseId),
  __SQR_RELEASE_VERSION__: JSON.stringify(releaseManifest.version),
};

const serverBuilds = [
  {
    entryPoint: path.resolve(cwd, "server/index-local.ts"),
    outfile: path.resolve(cwd, "dist-local/server/index-local.js"),
  },
  {
    entryPoint: path.resolve(cwd, "server/cluster-local.ts"),
    outfile: path.resolve(cwd, "dist-local/server/cluster-local.js"),
  },
  {
    entryPoint: path.resolve(cwd, "server/services/import-upload-excel-worker.ts"),
    outfile: path.resolve(cwd, "dist-local/server/import-upload-excel-worker.js"),
  },
  {
    entryPoint: path.resolve(cwd, "server/maintenance/recover-collection-receipt-metadata.ts"),
    outfile: path.resolve(cwd, "dist-local/scripts/recover-collection-receipt-metadata.js"),
  },
  {
    entryPoint: path.resolve(cwd, "server/maintenance/audit-collection-receipt-storage.ts"),
    outfile: path.resolve(cwd, "dist-local/scripts/audit-collection-receipt-storage.js"),
  },
];

for (const target of serverBuilds) {
  await build({
    bundle: true,
    entryPoints: [target.entryPoint],
    format: "esm",
    outfile: target.outfile,
    packages: "external",
    platform: "node",
    define: releaseDefines,
  });
}
