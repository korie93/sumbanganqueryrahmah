import path from "node:path";

export function isPathInsideDirectory(params: {
  parentDir: string;
  candidatePath: string;
}): boolean {
  const parentDir = path.resolve(params.parentDir);
  const candidatePath = path.resolve(params.candidatePath);
  const relativePath = path.relative(parentDir, candidatePath);

  return relativePath === "" || (
    Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
  );
}

export function resolveUploadsRootDir(params: {
  projectRoot?: string;
  uploadsDirName?: string;
} = {}): string {
  const projectRoot = path.resolve(params.projectRoot || process.cwd());
  const uploadsDirName = String(params.uploadsDirName || "uploads").trim();
  if (!uploadsDirName) {
    throw new Error("Uploads root directory name must not be empty.");
  }

  const uploadsRootDir = path.resolve(projectRoot, uploadsDirName);
  if (
    uploadsRootDir === projectRoot
    || !isPathInsideDirectory({ parentDir: projectRoot, candidatePath: uploadsRootDir })
  ) {
    throw new Error("Uploads root must resolve inside the project workspace.");
  }

  return uploadsRootDir;
}
