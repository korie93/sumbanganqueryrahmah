import assert from "node:assert/strict";
import axeCore from "axe-core";
import { JSDOM } from "jsdom";

type AxeViolation = {
  id: string;
  help: string;
  nodes: Array<{
    target: string[];
  }>;
};

type AxeResults = {
  violations: AxeViolation[];
};

type AxeRunOptions = Record<string, unknown> & {
  rules?: Record<string, { enabled: boolean }>;
};

type AxeWindow = Window & typeof globalThis & {
  axe: {
    run: (context: Document, options?: AxeRunOptions) => Promise<AxeResults>;
  };
};

function formatViolations(results: AxeResults): string {
  return results.violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ");
      return `${violation.id}: ${violation.help} [${nodes}]`;
    })
    .join("; ");
}

export async function assertNoAccessibilityViolations(
  html: string,
  options?: AxeRunOptions,
): Promise<void> {
  const documentHtml = html.includes("<title>")
    ? html
    : html.replace(
      /<body>/i,
      "<head><title>Accessibility Test</title></head><body>",
    );
  const dom = new JSDOM(
    documentHtml,
    {
      pretendToBeVisual: true,
      runScripts: "outside-only",
    },
  );

  try {
    const axeWindow = dom.window as unknown as AxeWindow;
    axeWindow.eval(axeCore.source);
    const results = await axeWindow.axe.run(axeWindow.document, {
      ...options,
      rules: {
        ...options?.rules,
        "color-contrast": { enabled: false },
      },
    });

    assert.equal(
      results.violations.length,
      0,
      formatViolations(results),
    );
  } finally {
    dom.window.close();
  }
}
