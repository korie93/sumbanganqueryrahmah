import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { resolveDocumentMetadata } from "@/app/document-metadata";

test("resolveDocumentMetadata returns public landing metadata for logged-out home", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "home",
    systemName: "SQR System",
    user: null,
  });

  assert.equal(metadata.title, "SQR — Sumbangan Query Rahmah");
  assert.equal(metadata.description, "SQR brings data search, analysis, import and operational monitoring together in a fast, structured and responsive platform.");
  assert.equal(metadata.socialDescription, "Data search, analysis and management within a structured operations platform.");
  assert.equal(metadata.publicLanding, true);
  assert.equal(metadata.robots, "index,follow,max-image-preview:large");
});

test("resolveDocumentMetadata returns login-specific metadata", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "login",
    systemName: "SQR System",
    user: null,
  });

  assert.equal(metadata.title, "Log In | SQR System");
  assert.match(metadata.description, /akses/i);
  assert.equal(metadata.robots, "noindex,nofollow,noarchive");
  assert.notEqual(metadata.publicLanding, true);
});

test("authenticated home retains internal metadata and configured system name", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "home",
    systemName: "Operations Workspace",
    user: { username: "test-operator", role: "admin" },
  });

  assert.equal(metadata.title, "Home | Operations Workspace");
  assert.match(metadata.description, /Ruang kerja dalaman/);
  assert.equal(metadata.robots, "noindex,nofollow,noarchive");
  assert.notEqual(metadata.publicLanding, true);
});

test("account recovery routes remain private with their existing Malay metadata", () => {
  const routes = [
    ["forgot-password", "Lupa Kata Laluan"],
    ["reset-password", "Tetapan Semula Kata Laluan"],
    ["activate-account", "Aktivasi Akaun"],
    ["change-password", "Tukar Kata Laluan"],
  ];
  for (const [currentPage, title] of routes) {
    const metadata = resolveDocumentMetadata({ currentPage: currentPage!, user: null });
    assert.equal(metadata.title, `${title} | SQR System`);
    assert.equal(metadata.robots, "noindex,nofollow,noarchive");
    assert.notEqual(metadata.publicLanding, true);
  }
});

test("static landing metadata and structured data use the approved copy and deployed assets", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const metadata = resolveDocumentMetadata({ currentPage: "home", user: null });
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes(`<title>${metadata.title}</title>`));
  assert.ok(html.includes(`content="${metadata.description}"`));
  assert.ok(html.includes(`content="${metadata.socialDescription}"`));
  assert.match(html, /rel="canonical" href="https:\/\/sqr-system\.com\/"/);
  assert.match(html, /name="theme-color" content="#ffffff"/);

  const jsonLd = html.match(/<script id="sqr-application-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(jsonLd, "SoftwareApplication structured data is present without executable inline code");
  const schema = JSON.parse(jsonLd) as Record<string, string>;
  assert.equal(schema["@type"], "SoftwareApplication");
  assert.equal(schema.name, metadata.title);
  assert.equal(schema.description, metadata.description);
  assert.equal(schema.url, "https://sqr-system.com/");
  assert.equal(schema.image, "https://sqr-system.com/brand/sqr-logo-minimal.webp");
  assert.ok(existsSync(new URL("../../public/brand/sqr-logo-minimal.webp", import.meta.url)));
  assert.ok(existsSync(new URL("../../public/apple-touch-icon.png", import.meta.url)));
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /\/assets\/(?:og-cover|apple-touch-icon)\.png/);
});

test("resolveDocumentMetadata returns monitor section metadata", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "monitor",
    monitorSection: "analysis",
    systemName: "SQR System",
    user: { username: "superuser", role: "superuser" },
  });

  assert.equal(metadata.title, "Analysis | SQR System");
  assert.equal(metadata.robots, "noindex,nofollow,noarchive");
});

test("resolveDocumentMetadata returns noindex metadata for not found pages", () => {
  const metadata = resolveDocumentMetadata({
    currentPage: "not-found",
    systemName: "SQR System",
    user: null,
  });

  assert.equal(metadata.title, "Halaman Tidak Dijumpai | SQR System");
  assert.match(metadata.description, /tidak dijumpai/i);
  assert.equal(metadata.robots, "noindex,nofollow,noarchive");
});
