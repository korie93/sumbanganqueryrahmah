import { readFileSync } from "node:fs";

const commitMessagePath = process.argv[2];
if (!commitMessagePath) {
  console.error("Commit message path is required.");
  process.exit(1);
}

const commitMessage = readFileSync(commitMessagePath, "utf8").trim();
const conventionalCommitPattern = /^(?:build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(?:\([a-z0-9._/-]+\))?!?:\s\S.{2,}$/i;

if (
  !commitMessage
  || (!conventionalCommitPattern.test(commitMessage)
    && !/^(?:Merge|Revert)\b/.test(commitMessage)
    && !/^(?:fixup!|squash!)/.test(commitMessage))
) {
  console.error(
    'Commit messages must follow "type(scope): summary" or be a Git-generated Merge/Revert/fixup!/squash! message.',
  );
  process.exit(1);
}
