import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readThemeTokenSource } from "../lib/theme-token-source.test-helper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientSrcDir = path.resolve(__dirname, "..");

function readComponentSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

function readClientSource(relativePath: string) {
  return readFileSync(path.resolve(clientSrcDir, relativePath), "utf8");
}

test("floating AI chat input has a formal accessible label", () => {
  const source = readComponentSource("AIChat.tsx");

  assert.match(source, /<label htmlFor=\{queryInputId\} className="sr-only">/);
  assert.match(source, /assistantLabel = "AI SQR"/);
  assert.match(source, /Taip soalan kepada \{assistantLabel\}/);
  assert.match(source, /data-floating-ai-query-input="true"/);
  assert.match(source, /maxLength=\{AI_REQUEST_MAX_CHARACTERS\}/);
  assert.match(source, /aria-describedby=\{queryLimitId\}/);
  assert.match(source, /aria-label="Hantar soalan AI"/);
  assert.match(source, /role="log"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-relevant="additions text"/);
  assert.match(source, /aria-atomic="false"/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /disabled=\{!isProcessing && !isTyping\}/);
  assert.doesNotMatch(source, /aria-disabled=\{!isProcessing && !isTyping\}/);
  assert.match(source, /<span>Hentikan AI<\/span>/);
  assert.match(source, /className="ai-notice ai-notice-error" role="alert"/);
  assert.match(source, /Pembantu AI dinyahaktifkan oleh tetapan sistem\./);
  assert.doesNotMatch(source, /aria-label="Send AI query"/);
  assert.doesNotMatch(source, />Stop AI</);
});

test("AI messages render markdown through React nodes instead of raw HTML", () => {
  const source = readComponentSource("AIMessage.tsx");
  const sanitizerSource = readComponentSource("ai-message-sanitizer.ts");

  assert.match(source, /role="article"/);
  assert.match(source, /aria-label=\{messageLabel\}/);
  assert.match(source, /Mesej pengguna/);
  assert.match(source, /Mesej pembantu AI/);
  assert.match(source, /sanitizeAIMessageContentForDisplay\(content\)/);
  assert.match(sanitizerSource, /import DOMPurify from "dompurify"/);
  assert.match(sanitizerSource, /DOMPurify\.sanitize/);
  assert.match(sanitizerSource, /ALLOWED_TAGS: \[\]/);
  assert.match(sanitizerSource, /removeUnsafeAIControlCharacters/);
  assert.match(source, /function parseAIMessageMarkdownBlocks/);
  assert.match(source, /function createAIMessageContentKeyFactory/);
  assert.match(source, /<pre key=\{blockKey\} className="ai-markdown-code">/);
  assert.match(source, /const ListTag = block\.ordered \? "ol" : "ul"/);
  assert.match(source, /key=\{getContentKey\(`\$\{blockKey\}:item`, item\)\}/);
  assert.match(source, /key=\{getContentKey\(`\$\{blockKey\}:line`, line\)\}/);
  assert.doesNotMatch(source, /key=\{`[^`]*\$\{(?:index|itemIndex|blockIndex)\}/);
  assert.match(source, /<br \/>/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("floating AI dialog exposes boolean disclosure state and semantic heading", () => {
  const source = readComponentSource("FloatingAI.tsx");
  const panelSource = readComponentSource("FloatingAIPanel.tsx");
  const triggerSource = readComponentSource("FloatingAITrigger.tsx");
  const focusSource = readComponentSource("useFloatingAIFocusManagement.ts");
  const combinedSource = `${source}\n${panelSource}\n${triggerSource}`;

  assert.match(triggerSource, /aria-expanded=\{isOpen\}/);
  assert.doesNotMatch(source, /"aria-expanded": isOpen \? "true" : "false"/);
  assert.match(panelSource, /role="dialog"/);
  assert.match(panelSource, /aria-labelledby=\{panelTitleId\}/);
  assert.match(source, /Desktop floating AI remains a non-modal dialog/);
  assert.match(source, /const assistantLabel = `AI \$\{resolvedSystemName\}`/);
  assert.match(panelSource, /Panel bantuan AI untuk pertanyaan berkaitan koleksi dan rekod/);
  assert.match(source, /const modalDialogA11yProps = isMobile/);
  assert.match(focusSource, /onEscapeKeyDown: handleMinimize/);
  assert.match(panelSource, /<h2\s+id=\{panelTitleId\}/);
  assert.match(source, /<button[\s\S]*styles\.floatingMobileBackdrop[\s\S]*aria-label=\{`Tutup panel \$\{assistantLabel\}`\}[\s\S]*onKeyDown=\{handleBackdropKeyDown\}/);
  assert.doesNotMatch(source, /role="presentation"/);
  assert.doesNotMatch(source, /aria-hidden="true"/);
  assert.match(combinedSource, /aria-label=\{`Kecilkan panel \$\{assistantLabel\}`\}/);
  assert.match(panelSource, /aria-label=\{`Memuatkan panel \$\{assistantLabel\}`\}/);
  assert.match(panelSource, /aria-label=\{`Reset sesi \$\{assistantLabel\}`\}/);
  assert.match(triggerSource, /aria-label=\{isOpen \? `Kecilkan panel \$\{assistantLabel\}` : `Buka panel \$\{assistantLabel\}`\}/);
  assert.doesNotMatch(combinedSource, /Close AI panel/);
  assert.doesNotMatch(combinedSource, /Minimize AI panel/);
  assert.doesNotMatch(combinedSource, /Open AI SQR panel/);
  assert.doesNotMatch(combinedSource, /Smart Query Engine/);
});

test("floating AI visual colors are sourced from design tokens", () => {
  const source = readComponentSource("FloatingAI.tsx");
  const panelSource = readComponentSource("FloatingAIPanel.tsx");
  const triggerSource = readComponentSource("FloatingAITrigger.tsx");
  const floatingCss = readComponentSource("FloatingAI.module.css");
  const tokens = readThemeTokenSource();
  const combinedSource = `${source}\n${panelSource}\n${triggerSource}`;

  assert.doesNotMatch(combinedSource, /bg-sky-500|bg-slate-950|text-slate-|border-sky-|border-blue-500|bg-blue-500|text-blue-200/);
  assert.match(panelSource, /styles\.floatingPanelSurface/);
  assert.match(triggerSource, /styles\.floatingTriggerButton/);
  assert.match(floatingCss, /var\(--floating-ai-panel-bg\)/);
  assert.match(floatingCss, /var\(--floating-ai-trigger-bg\)/);
  assert.match(tokens, /--floating-ai-panel-bg:/);
  assert.match(tokens, /--floating-ai-trigger-bg:/);
});

test("floating AI desktop focus handoff is bounded and panel transition is property-specific", () => {
  const source = readComponentSource("FloatingAI.tsx");
  const panelSource = readComponentSource("FloatingAIPanel.tsx");
  const triggerSource = readComponentSource("FloatingAITrigger.tsx");
  const focusSource = readComponentSource("useFloatingAIFocusManagement.ts");

  assert.match(focusSource, /requestAnimationFrame/);
  assert.match(focusSource, /cancelAnimationFrame/);
  assert.doesNotMatch(focusSource, /setTimeout/);
  assert.match(focusSource, /pendingTriggerFocusRestoreRef/);
  assert.match(focusSource, /triggerButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focusSource, /triggerButton\?\.isConnected/);
  assert.match(focusSource, /triggerButton\.closest\("\[hidden\]"\)/);
  assert.match(focusSource, /document\.addEventListener\("keydown", handleKeyDown\)/);
  assert.match(focusSource, /activeElement === document\.body/);
  assert.match(triggerSource, /layoutState\.shouldAutoMinimize/);
  assert.match(focusSource, /event\.key !== "Escape"/);
  assert.match(focusSource, /handleMinimize\(\)/);
  assert.match(focusSource, /focusTriggerButton\(\);/);
  assert.match(panelSource, /transition-\[opacity,transform\]/);
  assert.doesNotMatch(`${source}\n${panelSource}`, /floatingPanelShell,[\s\S]*transition-all/);
});

test("floating AI motion and scroll styles include accessibility fallbacks", () => {
  const aiCss = readClientSource("styles/ai.css");
  const floatingCss = readComponentSource("FloatingAI.module.css");

  assert.match(aiCss, /\.ai-messages::-webkit-scrollbar-thumb[\s\S]*background:\s*var\(--ai-scroll-thumb\)/);
  assert.match(aiCss, /\.ai-messages\s*\{[\s\S]*scrollbar-width:\s*thin/);
  assert.match(aiCss, /\.ai-messages\s*\{[\s\S]*scrollbar-color:\s*var\(--ai-scroll-thumb\) transparent/);
  assert.doesNotMatch(aiCss, /scrollbar-gutter:/);
  assert.match(aiCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(floatingCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(floatingCss, /max-height:\s*calc\(100vh - 5rem\);[\s\S]*max-height:\s*calc\(100svh - 5rem\);[\s\S]*max-height:\s*calc\(100dvh - 5rem\);/);
  assert.match(floatingCss, /height:\s*var\(--floating-ai-panel-height, 100vh\);[\s\S]*height:\s*var\(--floating-ai-panel-height, 100svh\);[\s\S]*height:\s*var\(--floating-ai-panel-height, 100dvh\);/);
  assert.match(floatingCss, /\.aiThinkingRing::after[\s\S]*animation:\s*none/);
});

test("viewport fallback only reaches 100vh when dvh and svh are unsupported", () => {
  const tokens = readThemeTokenSource();

  assert.match(tokens, /@supports not \(height: 100dvh\) \{/);
  assert.match(tokens, /@supports not \(height: 100dvh\) and not \(height: 100svh\) \{/);
});
