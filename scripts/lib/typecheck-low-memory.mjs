import { createHash } from "node:crypto";

function serializeDiagnostic(ts, diagnostic) {
  const position = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    : undefined;
  return {
    code: diagnostic.code,
    category: diagnostic.category,
    file: diagnostic.file?.fileName ?? null,
    start: diagnostic.start ?? null,
    line: position ? position.line + 1 : null,
    column: position ? position.character + 1 : null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  };
}

// Local aid, not a replacement for the standard CI compiler. Keep root options
// and project-level ambient context, while releasing each dependency graph.
export async function checkTypecheckBatch(configPath, selectedFiles = null, contextTypes = []) {
  const { default: ts } = await import("typescript");
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (!config) throw new Error("Cannot read TypeScript configuration.");
  if (config.options.incremental || config.options.composite || config.options.declaration
    || config.options.emitDeclarationOnly || config.projectReferences?.length) {
    throw new Error("Use the standard typecheck for incremental, declaration or referenced projects.");
  }
  const hash = createHash("sha256").update(ts.version).update(JSON.stringify(config.options))
    .update(JSON.stringify(config.fileNames));
  const ambient = [];
  function hasAugmentation(node) {
    return ts.isModuleDeclaration(node) || ts.forEachChild(node, hasAugmentation) === true;
  }
  for (const name of config.fileNames) {
    const text = ts.sys.readFile(name);
    if (text === undefined) throw new Error(`Source disappeared: ${name}`);
    hash.update(name).update("\0").update(text).update("\0");
    const source = ts.createSourceFile(name, text, config.options.target ?? ts.ScriptTarget.Latest);
    if (source.isDeclarationFile || !ts.isExternalModule(source) || hasAugmentation(source)) ambient.push(name);
  }
  for (const name of contextTypes) {
    const resolved = ts.resolveTypeReferenceDirective(name, configPath, config.options, ts.sys)
      .resolvedTypeReferenceDirective?.resolvedFileName;
    if (!resolved) throw new Error(`Required shared type context is unavailable: ${name}`);
    ambient.push(resolved);
    hash.update(name).update("\0").update(resolved).update("\0").update(ts.sys.readFile(resolved) ?? "");
  }
  const fingerprint = hash.digest("hex");
  const files = config.fileNames;
  let diagnostics;
  let sourceCount = 0;
  if (selectedFiles === null) {
    diagnostics = config.errors;
  } else {
    if (!Array.isArray(selectedFiles) || selectedFiles.length === 0
      || new Set(selectedFiles).size !== selectedFiles.length
      || selectedFiles.some((file) => !files.includes(file))) {
      throw new Error("Invalid or incomplete semantic batch input.");
    }
    const roots = [...new Set([...ambient, ...selectedFiles])];
    const program = ts.createProgram({ rootNames: roots, options: config.options });
    sourceCount = program.getSourceFiles().length;
    diagnostics = [...config.errors, ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(), ...program.getSyntacticDiagnostics(),
      ...selectedFiles.flatMap((file) => program.getSemanticDiagnostics(program.getSourceFile(file)))];
  }
  return {
    fingerprint,
    rootCount: config.fileNames.length,
    sourceCount,
    ambientCount: ambient.length,
    files: selectedFiles ?? files,
    diagnostics: ts.sortAndDeduplicateDiagnostics(diagnostics).map((diagnostic) => serializeDiagnostic(ts, diagnostic)),
    heapUsedBytes: process.memoryUsage().heapUsed,
  };
}

export function verifyTypecheckBatch(plan, result, requestedFiles) {
  if (result.fingerprint !== plan.fingerprint || result.rootCount !== plan.rootCount
    || result.ambientCount !== plan.ambientCount) {
    throw new Error("Project changed during typecheck. Run again against a stable checkout.");
  }
  if (JSON.stringify(result.files) !== JSON.stringify(requestedFiles)) {
    throw new Error("Semantic batch coverage does not match its request.");
  }
}
