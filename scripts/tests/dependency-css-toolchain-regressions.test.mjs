import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import postcss from "postcss";

const require = createRequire(import.meta.url);
// Exercise the copies resolved by the actual build-tool consumers.
const sourceMapConsumers = ["postcss", "@tailwindcss/node"].map((name) => ({
  name,
  ...createRequire(require.resolve(name))("source-map-js"),
}));
const readJson = (name) => JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"));

test("unused typography and its vulnerable selector-parser chain stay out of the dependency graph", () => {
  const manifest = readJson("package.json");
  const lock = readJson("package-lock.json");
  for (const name of ["@tailwindcss/typography", "postcss-selector-parser"]) {
    assert.equal(manifest.dependencies?.[name], undefined);
    assert.equal(manifest.devDependencies?.[name], undefined);
    assert.equal(
      Object.keys(lock.packages).some((key) => key.endsWith(`node_modules/${name}`)),
      false,
      `${name} must not return as an unused build dependency`,
    );
  }
});

const basicMap = () => ({
  version: 3,
  sources: ["original.css"],
  sourcesContent: [".sqr { color: red; }\n"],
  names: [],
  mappings: "AAAA",
});
const indexedMap = (offset, map = basicMap()) => ({
  version: 3,
  sections: [{ offset, map }],
});

for (const { name, SourceMapConsumer, SourceMapGenerator } of sourceMapConsumers) {
  test(`${name} source-map consumer rejects unsafe indexed offsets before expansion`, () => {
    // Constructor-only probes remain bounded even if validation regresses: do
    // not serialize huge line gaps or feed them into SourceNode in this test.
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
      for (const field of ["line", "column"]) {
        assert.throws(
          () => new SourceMapConsumer(indexedMap({ line: 0, column: 0, [field]: value })),
          /Section offset line and column must be non-negative integers/,
          `offset.${field} = ${String(value)}`,
        );
      }
    }
    assert.throws(
      () => new SourceMapConsumer(indexedMap({ line: 10_000_001, column: 0 })),
      /Section offset line must not exceed/,
    );
    assert.throws(
      () => new SourceMapConsumer(indexedMap(
        { line: 6_000_000, column: 0 },
        indexedMap({ line: 6_000_000, column: 0 }),
      )),
      /including offsets of nested sections/,
    );
  });

  test(`${name} source-map consumer preserves ordinary mappings and indexed sections`, () => {
    const generator = new SourceMapGenerator({ file: "generated.css" });
    generator.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 3, column: 2 },
      source: "original.css",
      name: "color",
    });
    generator.setSourceContent("original.css", "\n.sqr {\n  color: red;\n}\n");
    const consumer = new SourceMapConsumer(generator.toJSON());
    assert.deepEqual(consumer.originalPositionFor({ line: 1, column: 0 }), {
      source: "original.css", line: 3, column: 2, name: "color",
    });
    assert.equal(consumer.sourceContentFor("original.css"), "\n.sqr {\n  color: red;\n}\n");
    const indexed = new SourceMapConsumer(indexedMap({ line: 2, column: 0 }, generator.toJSON()));
    const mappings = [];
    indexed.eachMapping((mapping) => mappings.push(mapping));
    assert.equal(mappings.length, 1);
    assert.equal(mappings[0].generatedLine, 3);
    assert.equal(mappings[0].generatedColumn, 0);
    assert.equal(mappings[0].originalLine, 3);
    assert.equal(mappings[0].originalColumn, 2);
    assert.deepEqual(indexed.sources, ["original.css"]);
  });
}

test("PostCSS retains CSS selectors and original positions while generating source maps", async () => {
  const input = ".sqr:is(.active, [data-state=\"open\"])::before {\n  color: red;\n}\n";
  const result = await postcss([{
    postcssPlugin: "sqr-dependency-mapping-fixture",
    Declaration(declaration) {
      if (declaration.prop === "color") declaration.value = "blue";
    },
  }]).process(input, {
    from: "dependency-fixture-input.css",
    to: "dependency-fixture-output.css",
    map: { inline: false, annotation: false, sourcesContent: true },
  });
  assert.equal(result.css, input.replace("color: red", "color: blue"));
  const { SourceMapConsumer } = sourceMapConsumers[0];
  const consumer = new SourceMapConsumer(result.map.toJSON());
  assert.deepEqual(consumer.originalPositionFor({ line: 2, column: 2 }), {
    source: "dependency-fixture-input.css", line: 2, column: 2, name: null,
  });
  assert.equal(consumer.sourceContentFor("dependency-fixture-input.css"), input);
});
