import { readFileSync, statSync, writeFileSync } from "node:fs";

export const RELEASE_MANIFEST_FILENAME = "release-manifest.json";
export const RELEASE_MANIFEST_MAX_BYTES = 16 * 1024;

const RELEASE_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RELEASE_TOKEN_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;

function requireReleaseToken(value, label) {
  const normalized = String(value || "").trim();
  if (!RELEASE_TOKEN_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a non-empty release-safe token.`);
  }
  return normalized;
}

function requireCommitSha(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!RELEASE_SHA_PATTERN.test(normalized)) {
    throw new Error("Release commit SHA must contain exactly 40 or 64 lowercase hexadecimal characters.");
  }
  return normalized;
}

function requireBuiltAt(value) {
  const timestamp = new Date(String(value || "").trim());
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Release builtAt must be a valid ISO timestamp.");
  }
  return timestamp.toISOString();
}

function buildReleaseId(version, commitSha, builtAt) {
  const timestamp = builtAt
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  return `sqr-${version}-${commitSha.slice(0, 12)}-${timestamp}`;
}

export function createReleaseManifest({ builtAt, commitSha, sourceDirty, version }) {
  const normalizedVersion = requireReleaseToken(version, "Release version");
  const normalizedCommitSha = requireCommitSha(commitSha);
  const normalizedBuiltAt = requireBuiltAt(builtAt);

  return Object.freeze({
    schemaVersion: 1,
    releaseId: buildReleaseId(normalizedVersion, normalizedCommitSha, normalizedBuiltAt),
    version: normalizedVersion,
    commitSha: normalizedCommitSha,
    builtAt: normalizedBuiltAt,
    sourceDirty: sourceDirty === true,
  });
}

export function parseReleaseManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Release manifest must be a JSON object.");
  }

  if (value.schemaVersion !== 1) {
    throw new Error("Unsupported release manifest schema version.");
  }

  const manifest = createReleaseManifest({
    builtAt: value.builtAt,
    commitSha: value.commitSha,
    sourceDirty: value.sourceDirty,
    version: value.version,
  });

  if (value.releaseId !== manifest.releaseId) {
    throw new Error("Release manifest ID does not match its immutable metadata.");
  }

  return manifest;
}

export function readReleaseManifest(filePath) {
  const stat = statSync(filePath);
  if (!stat.isFile() || stat.size < 2 || stat.size > RELEASE_MANIFEST_MAX_BYTES) {
    throw new Error(`Release manifest must be a regular JSON file no larger than ${RELEASE_MANIFEST_MAX_BYTES} bytes.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("Release manifest contains malformed JSON.");
  }
  return parseReleaseManifest(parsed);
}

export function writeReleaseManifest(filePath, manifest) {
  const validated = parseReleaseManifest(manifest);
  writeFileSync(filePath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
}
