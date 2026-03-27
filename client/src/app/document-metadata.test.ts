import assert from "node:assert/strict";
import test from "node:test";
import { resolveDocumentMetadata } from "@/app/document-metadata";

test("resolveDocumentMetadata returns public landing metadata for logged-out home", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "home",
    systemName: "SQR System",
    user: null,
  });

  assert.equal(metadata.title, "Platform Operasi Dalaman | SQR System");
  assert.match(metadata.description, /general search/i);
});

test("resolveDocumentMetadata returns login-specific metadata", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "login",
    systemName: "SQR System",
    user: null,
  });

  assert.equal(metadata.title, "Log In | SQR System");
  assert.match(metadata.description, /akses/i);
});

test("resolveDocumentMetadata returns monitor section metadata", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "monitor",
    monitorSection: "analysis",
    systemName: "SQR System",
    user: { username: "superuser", role: "superuser" },
  });

  assert.equal(metadata.title, "Analysis | SQR System");
});
