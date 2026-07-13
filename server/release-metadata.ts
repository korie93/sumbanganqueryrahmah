import { readOptionalString } from "./config/runtime-config-read-utils";

export interface PublicReleaseMetadata {
  builtAt: string | null;
  commitSha: string;
  releaseId: string;
  version: string;
}

interface ReleaseMetadataInput {
  builtAt?: string | undefined;
  commitSha?: string | undefined;
  releaseId?: string | undefined;
  version?: string | undefined;
}

declare const __SQR_RELEASE_BUILT_AT__: string;
declare const __SQR_RELEASE_COMMIT_SHA__: string;
declare const __SQR_RELEASE_ID__: string;
declare const __SQR_RELEASE_VERSION__: string;

const RELEASE_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RELEASE_TOKEN_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;

function normalizeReleaseToken(value: string | undefined, fallback: string): string {
  const normalized = String(value || "").trim();
  return RELEASE_TOKEN_PATTERN.test(normalized) ? normalized : fallback;
}

function normalizeReleaseBuiltAt(value: string | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function resolvePublicReleaseMetadata(
  input: ReleaseMetadataInput = {},
): PublicReleaseMetadata {
  const version = normalizeReleaseToken(input.version, "development");
  const candidateSha = String(input.commitSha || "").trim().toLowerCase();
  const commitSha = RELEASE_SHA_PATTERN.test(candidateSha) ? candidateSha : "development";
  const fallbackReleaseId = `${version}-${commitSha.slice(0, 12)}`;

  return Object.freeze({
    builtAt: normalizeReleaseBuiltAt(input.builtAt),
    commitSha,
    releaseId: normalizeReleaseToken(input.releaseId, fallbackReleaseId),
    version,
  });
}

function readEmbeddedValue(name: "builtAt" | "commitSha" | "releaseId" | "version") {
  switch (name) {
    case "builtAt":
      return typeof __SQR_RELEASE_BUILT_AT__ === "string"
        ? __SQR_RELEASE_BUILT_AT__
        : readOptionalString("SQR_RELEASE_BUILT_AT") ?? undefined;
    case "commitSha":
      return typeof __SQR_RELEASE_COMMIT_SHA__ === "string"
        ? __SQR_RELEASE_COMMIT_SHA__
        : readOptionalString("SQR_RELEASE_SHA") ?? undefined;
    case "releaseId":
      return typeof __SQR_RELEASE_ID__ === "string"
        ? __SQR_RELEASE_ID__
        : readOptionalString("SQR_RELEASE_ID") ?? undefined;
    case "version":
      return typeof __SQR_RELEASE_VERSION__ === "string"
        ? __SQR_RELEASE_VERSION__
        : readOptionalString("npm_package_version") ?? undefined;
  }
}

const publicReleaseMetadata = resolvePublicReleaseMetadata({
  builtAt: readEmbeddedValue("builtAt"),
  commitSha: readEmbeddedValue("commitSha"),
  releaseId: readEmbeddedValue("releaseId"),
  version: readEmbeddedValue("version"),
});

export function getPublicReleaseMetadata(): PublicReleaseMetadata {
  return publicReleaseMetadata;
}
