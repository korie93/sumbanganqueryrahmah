import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const PICOMATCH_SOURCE = "file:vendor/picomatch/picomatch-4.0.7-sqr.2.tgz";
export const PICOMATCH_INTEGRITY = "sha512-BMfH7qO6v1cqss6F6uQpP0WpbLR40zK/KV81qkQJVptAja8BNUsNPJ4YhYriZ3OOMWCM8KRrPnEFvQEpBRsEnA==";
export const PICOMATCH_ADVISORY = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";

// Read data only; never load or execute package code during the audit.
export function verifyPicomatchVendor({ cwd = process.cwd(), manifest, lock } = {}) {
  if (manifest?.overrides?.picomatch !== "$picomatch" || manifest?.devDependencies?.picomatch !== PICOMATCH_SOURCE) {
    throw new Error("Picomatch must use the reviewed local dev dependency and override.");
  }
  const bytes = readFileSync(path.join(cwd, PICOMATCH_SOURCE.slice(5)));
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== PICOMATCH_INTEGRITY) {
    throw new Error("Picomatch vendor archive integrity mismatch.");
  }
  const hashBytes = readFileSync(path.join(cwd, "vendor/picomatch/files.sha256.json"));
  if (createHash("sha256").update(hashBytes).digest("hex") !== "79cc4d2b99a367699d8744951e2b804678fe7d6ed7a6a80d797a302c73893e8a") throw new Error("Picomatch manifest integrity mismatch.");
  const hashes = JSON.parse(hashBytes.toString("utf8"));
  const expected = ["LICENSE", "README.md", "index.js", "lib/constants.js", "lib/parse.js", "lib/picomatch.js", "lib/scan.js", "lib/utils.js", "package.json", "posix.js"].sort();
  if (JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(expected)
    || Object.values(hashes).some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error("Invalid Picomatch file manifest.");
  const copies = Object.entries(lock?.packages ?? {}).filter(([name]) => name.endsWith("node_modules/picomatch"));
  if (copies.length !== 1 || copies[0][0] !== "node_modules/picomatch") throw new Error("Unexpected Picomatch dependency copies.");
  const [name, entry] = copies[0];
  if (entry.version !== "4.0.7" || entry.dev !== true || entry.resolved !== PICOMATCH_SOURCE || entry.integrity !== PICOMATCH_INTEGRITY) {
    throw new Error("Unpatched or production Picomatch in package lock.");
  }
  const root = path.join(cwd, name);
  const actual = [];
  const walk = (directory, prefix = "") => {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error("Unsafe Picomatch directory.");
    for (const item of readdirSync(directory)) {
      const relative = prefix + item;
      const file = path.join(directory, item);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Unsafe Picomatch link.");
      if (stat.isDirectory() && relative === "lib") walk(file, relative + "/");
      else {
        if (!stat.isFile() || !Object.hasOwn(hashes, relative) || stat.size > 131072) throw new Error("Unexpected Picomatch file.");
        if (createHash("sha256").update(readFileSync(file)).digest("hex") !== hashes[relative]) throw new Error("Installed Picomatch differs from reviewed patch.");
        actual.push(relative);
      }
    }
  };
  walk(root);
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw new Error("Incomplete Picomatch installation.");
  return { nodes: copies.map(([node]) => node), lock };
}

// Acknowledges a verified source patch, not acceptance of an unpatched risk.
export function patchedPicomatchFindings(report, verified) {
  const accepted = new Set();
  if (!verified) return accepted;
  const remaining = new Map(), parents = new Map(), queue = [];
  for (const [name, item] of Object.entries(report.vulnerabilities)) {
    if (item.severity !== "high" || item.nodes.some(node => verified.lock.packages[node]?.dev !== true)) continue;
    const advisories = item.via.filter(via => typeof via !== "string");
    if (!advisories.every(via => name === "picomatch" && via.name === "picomatch" && via.dependency === "picomatch"
      && via.url === PICOMATCH_ADVISORY && via.range === "<=4.0.7" && via.severity === "high"
      && item.nodes.every(node => verified.nodes.includes(node)))) continue;
    const children = new Set(item.via.filter(via => typeof via === "string"));
    remaining.set(name, children.size);
    if (children.size === 0 && advisories.length > 0) queue.push(name);
    for (const child of children) {
      if (!parents.has(child)) parents.set(child, []);
      parents.get(child).push(name);
    }
  }
  // Linear traversal; unresolved cycles or references remain blocking.
  for (let index = 0; index < queue.length; index++) {
    const name = queue[index];
    accepted.add(name);
    for (const parent of parents.get(name) ?? []) {
      remaining.set(parent, remaining.get(parent) - 1);
      if (remaining.get(parent) === 0) queue.push(parent);
    }
  }
  return accepted;
}
