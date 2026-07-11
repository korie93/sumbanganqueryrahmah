import { build } from "esbuild";
import path from "node:path";

const cwd = process.cwd();

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
];

for (const target of serverBuilds) {
  await build({
    bundle: true,
    entryPoints: [target.entryPoint],
    format: "esm",
    outfile: target.outfile,
    packages: "external",
    platform: "node",
  });
}
