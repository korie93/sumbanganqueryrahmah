import process from "node:process";

const supportedMajor = 24;
const version = String(process.version || "").trim();
const parsed = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);

if (!parsed) {
  console.error(`Unable to parse Node.js version: ${version || "(empty)"}`);
  process.exit(1);
}

const major = Number(parsed[1]);

if (!Number.isInteger(major) || major !== supportedMajor) {
  console.error(
    [
      `Unsupported Node.js version detected: ${version}`,
      `This project requires Node.js ${supportedMajor}.x (see .nvmrc and package.json engines).`,
      "Please switch Node version and retry.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Node.js version check passed (${version}).`);
