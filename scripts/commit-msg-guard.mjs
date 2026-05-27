import { readFileSync } from "node:fs";
import { validateCommitMessage } from "./lib/git-hook-guards.mjs";

const messagePath = process.argv[2];

if (!messagePath) {
  console.error("Commit message guard requires the commit message file path from Git.");
  process.exit(1);
}

const message = readFileSync(messagePath, "utf8")
  .split(/\r?\n/u)
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n")
  .trim();
const validationError = validateCommitMessage(message);

if (validationError) {
  console.error(validationError);
  console.error("Allowed examples: fix(auth): reject stale token, test(ui): cover mobile nav");
  console.error("Use --no-verify only for documented emergency recovery commits.");
  process.exit(1);
}
