import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot = path.join(repoRoot, "server");
const clientRoot = path.join(repoRoot, "client", "src");
const sharedRoot = path.join(repoRoot, "shared");
const sourceRoots = [serverRoot, clientRoot, sharedRoot];
const sourceFileExtensions = new Set([".ts", ".tsx"]);
const resolvableSourceImportExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const excludedDirectoryNames = new Set([
  "__mocks__",
  "__tests__",
  "dist",
  "dist-local",
  "node_modules",
  "test-support",
  "tests",
]);

function normalizePath(filePath) {
  return path.resolve(filePath);
}

function formatPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function collectSourceFiles(directoryPath, results = []) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectoryNames.has(entry.name)) {
        collectSourceFiles(absolutePath, results);
      }
      continue;
    }

    if (
      !entry.isFile()
      || !sourceFileExtensions.has(path.extname(entry.name))
      || entry.name.endsWith(".test.ts")
      || entry.name.endsWith(".test.tsx")
    ) {
      continue;
    }

    results.push(normalizePath(absolutePath));
  }

  return results;
}

function buildCandidatePaths(basePath) {
  const extension = path.extname(basePath);
  if (extension) {
    if (!resolvableSourceImportExtensions.has(extension)) {
      return [basePath];
    }

    const withoutExtension = basePath.slice(0, -extension.length);
    return [
      basePath,
      `${withoutExtension}.ts`,
      `${withoutExtension}.tsx`,
    ];
  }

  return [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
}

function resolveImportBasePath(fromFile, specifier) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.resolve(path.dirname(fromFile), specifier);
  }

  if (specifier.startsWith("@/")) {
    return path.join(clientRoot, specifier.slice(2));
  }

  if (specifier.startsWith("@shared/")) {
    return path.join(sharedRoot, specifier.slice("@shared/".length));
  }

  return null;
}

function resolveLocalImport(fromFile, specifier, sourceFileSet) {
  const basePath = resolveImportBasePath(fromFile, specifier);
  if (!basePath) {
    return null;
  }

  for (const candidatePath of buildCandidatePaths(basePath)) {
    const normalizedCandidate = normalizePath(candidatePath);
    if (sourceFileSet.has(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}

function collectRuntimeImportSpecifiers(sourceFile) {
  const specifiers = [];

  const visit = (node) => {
    if (
      ts.isImportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.importClause?.isTypeOnly
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.isTypeOnly
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function buildRuntimeImportGraph() {
  const sourceFiles = sourceRoots.flatMap((root) => collectSourceFiles(root));
  const sourceFileSet = new Set(sourceFiles);
  const graph = new Map();

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const dependencies = collectRuntimeImportSpecifiers(sourceFile)
      .map((specifier) => resolveLocalImport(filePath, specifier, sourceFileSet))
      .filter((dependency) => dependency !== null)
      .sort();

    graph.set(filePath, dependencies);
  }

  return graph;
}

function normalizeCycle(cycle) {
  const nodes = cycle.slice(0, -1);
  const formattedNodes = nodes.map(formatPath);
  let lowestIndex = 0;
  for (let index = 1; index < formattedNodes.length; index += 1) {
    if (formattedNodes[index] < formattedNodes[lowestIndex]) {
      lowestIndex = index;
    }
  }

  const rotated = [
    ...formattedNodes.slice(lowestIndex),
    ...formattedNodes.slice(0, lowestIndex),
  ];
  rotated.push(rotated[0]);
  return rotated.join(" -> ");
}

function findRuntimeImportCycles(graph) {
  const visitState = new Map();
  const stack = [];
  const stackIndexByFile = new Map();
  const cyclesByKey = new Map();

  const visit = (filePath) => {
    visitState.set(filePath, "visiting");
    stackIndexByFile.set(filePath, stack.length);
    stack.push(filePath);

    for (const dependency of graph.get(filePath) ?? []) {
      const dependencyState = visitState.get(dependency);
      if (dependencyState === "visiting") {
        const cycleStartIndex = stackIndexByFile.get(dependency);
        const cycle = [...stack.slice(cycleStartIndex), dependency];
        cyclesByKey.set(normalizeCycle(cycle), cycle);
        continue;
      }

      if (!dependencyState) {
        visit(dependency);
      }
    }

    stack.pop();
    stackIndexByFile.delete(filePath);
    visitState.set(filePath, "visited");
  };

  for (const filePath of [...graph.keys()].sort()) {
    if (!visitState.has(filePath)) {
      visit(filePath);
    }
  }

  return [...cyclesByKey.keys()].sort();
}

test("production TypeScript source has no local runtime import cycles", () => {
  const graph = buildRuntimeImportGraph();
  const cycles = findRuntimeImportCycles(graph);

  assert.deepEqual(cycles, []);
});
