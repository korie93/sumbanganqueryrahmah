import { readFileSync } from "node:fs";

const commitMessagePath = process.argv[2];
if (!commitMessagePath) {
  console.error("Commit message path is required.");
  process.exit(1);
}

function resolveCommitSubject(commitMessageText) {
  const lines = String(commitMessageText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return lines[0] ?? "";
}

const commitMessage = readFileSync(commitMessagePath, "utf8");
const commitSubject = resolveCommitSubject(commitMessage);
const conventionalCommitPattern = /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9._/-]+\))?!?:\s\S.{2,}$/i;

if (
  !commitSubject
  || (!conventionalCommitPattern.test(commitSubject)
    && !/^(?:Merge|Revert)\b/.test(commitSubject)
    && !/^(?:fixup!|squash!)/.test(commitSubject))
) {
  console.error(
    'Commit messages must follow "type(scope): summary" or be a Git-generated Merge/Revert/fixup!/squash! message.',
  );
  process.exit(1);
}
