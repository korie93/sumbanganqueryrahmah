import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FloatingPanelShell } from "@/components/FloatingAIShell";
import { resolveFloatingAiLayout } from "@/components/floating-ai-layout";

for (const viewport of [
  { width: 1366, height: 900, mobile: false, keyboard: false, inset: 0 },
  { width: 375, height: 844, mobile: true, keyboard: false, inset: 0 },
  { width: 320, height: 640, mobile: true, keyboard: true, inset: 0 },
  { width: 390, height: 844, mobile: true, keyboard: true, inset: 280 },
]) {
  test(`floating panel receives resolver dimensions at ${viewport.width}px, inset ${viewport.inset}`, () => {
    const { panel } = resolveFloatingAiLayout({
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      viewportBottomInset: viewport.inset,
      isMobile: viewport.mobile,
      isOpen: true,
      hasBlockingDialog: false,
      keyboardOpen: viewport.keyboard,
      hasFocusedEditable: false,
      hasDensePage: false,
      preferCompactPanel: false,
      avoidRects: [],
    });
    const markup = renderToStaticMarkup(
      <FloatingPanelShell className="panel" hidden={false} placement={panel}>Chat</FloatingPanelShell>,
    );
    const offset = (value: number | null) => value === null ? "auto" : `${value}px`;
    for (const [name, value] of Object.entries({
      left: offset(panel.left), right: offset(panel.right),
      bottom: `${panel.bottom}px`, width: `${panel.width}px`, height: `${panel.height}px`,
    })) {
      assert.ok(markup.includes(`--floating-ai-panel-${name}:${value}`), `Missing ${name}: ${value}`);
    }
    assert.match(markup, />Chat<\/div>/);
  });
}

test("floating panel without placement retains its stylesheet fallback", () => {
  const markup = renderToStaticMarkup(<FloatingPanelShell className="panel" hidden>Chat</FloatingPanelShell>);
  assert.match(markup, /hidden=""/);
  assert.doesNotMatch(markup, /style=|--floating-ai-panel-/);
});
