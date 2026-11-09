import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AIMessage, { AIMessageContent } from "./AIMessage";

const render = (content: string, allowBold = true) => renderToStaticMarkup(createElement(AIMessageContent, { content, allowBold }));
const strongText = (markup: string) => [...markup.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((match) => match[1]);

test("assistant paragraph emphasis renders only closed same-line double-star runs", () => {
  const markup = render("Ringkasan **Jumlah RM 125.00** dan **Tarikh 09/11/2026**.");
  assert.deepEqual(strongText(markup), ["Jumlah RM 125.00", "Tarikh 09/11/2026"]);
  assert.ok(markup.includes("Ringkasan <strong>Jumlah RM 125.00</strong> dan <strong>Tarikh 09/11/2026</strong>."));
  assert.equal([...markup.matchAll(/<p\b/g)].length, 1);
  assert.doesNotMatch(markup, /\*\*/);
});

test("assistant list emphasis preserves semantic grouping, numbering and repeated labels", () => {
  const markup = render("- **Jumlah:** RM 125.00\n- **Jumlah:** RM 25.00\n\n7. **Semak** rekod\n8. **Sahkan** jumlah");
  assert.deepEqual(strongText(markup), ["Jumlah:", "Jumlah:", "Semak", "Sahkan"]);
  assert.match(markup, /<ul\b[^>]*><li><strong>Jumlah:<\/strong> RM 125\.00<\/li><li><strong>Jumlah:<\/strong> RM 25\.00<\/li><\/ul>/);
  assert.match(markup, /<ol\b[^>]*start="7"[^>]*><li><strong>Semak<\/strong> rekod<\/li>/);
});

test("bold formatting preserves account references, leading zeroes, amounts and Unicode", () => {
  const markup = render("Akaun **0000123412341234**\nIC 000123-01-0123\n**RM 1,234.50 🧾 👨‍👩‍👧‍👦**");
  assert.deepEqual(strongText(markup), ["0000123412341234", "RM 1,234.50 🧾 👨‍👩‍👧‍👦"]);
  assert.match(markup, /IC 000123-01-0123/);
  assert.doesNotMatch(markup, /<ol\b/);
});

test("fenced and unfinished code keep double-star text completely literal", () => {
  for (const content of ["```txt\n  **000123**\n\t**Jumlah RM 125.00**\n```", "```txt\n  **000123**\n\t**Jumlah "]) {
    const markup = render(content);
    assert.deepEqual(strongText(markup), []);
    assert.match(markup, /<code data-language="txt"> {2}\*\*000123\*\*\n\t\*\*Jumlah /);
    assert.match(markup, /role="region" aria-label="Kod dalam jawapan AI"/);
  }
});

test("inline backtick runs stay literal and protect their contents from emphasis", () => {
  const markup = render('Rujukan `**000123**` dan ``**kod**`` serta **Jumlah**.');
  assert.deepEqual(strongText(markup), ["Jumlah"]);
  assert.ok(markup.includes('`**000123**` dan ``**kod**`` serta <strong>Jumlah</strong>.'));
  assert.doesNotMatch(markup, /<code\b|<a\b/);
  assert.deepEqual(strongText(render("Awal `**belum ditutup** kemudian **literal**")), []);
});

test("escaped, triple, empty, whitespace-padded and multiline markers remain literal", () => {
  for (const content of [String.raw`\**literal**`, String.raw`**literal\**`, "***literal***", "****", "** **", "** awal**", "**akhir **", "**baris satu\nbaris dua**"]) {
    assert.deepEqual(strongText(render(content)), [], content);
  }
  const stars = render("2 * 3; A***B***C; 2**3; akhir **belum");
  assert.deepEqual(strongText(stars), []);
  assert.ok(stars.includes("2 * 3; A***B***C; 2**3; akhir **belum"));
});

test("every growing prefix keeps unmatched markers literal until closed without changing completed emphasis", () => {
  const text = "Awal **Jumlah** kemudian **Baki** selesai.";
  const firstClose = text.indexOf("** kemudian") + 2;
  const secondClose = text.indexOf("** selesai") + 2;
  for (let length = 1; length <= text.length; length++) {
    const markup = render(text.slice(0, length));
    const expected = length < firstClose ? [] : length < secondClose ? ["Jumlah"] : ["Jumlah", "Baki"];
    assert.deepEqual(strongText(markup), expected, `prefix ${length}`);
    assert.doesNotMatch(markup, /<(?:script|img|svg|iframe|a)\b/i);
  }
});

test("raw HTML never supplies emphasis or executable nodes and explicit Markdown stays React text", () => {
  const markup = render('**Selamat 000123** <strong>teks biasa</strong><img src=x onerror="alert(1)"><svg onload="alert(2)"></svg><script>alert(3)</script>');
  assert.deepEqual(strongText(markup), ["Selamat 000123"]);
  assert.doesNotMatch(markup, /<(?:script|img|svg|iframe|a)\b|\sonerror=|\sonload=/i);
  assert.doesNotMatch(render('**&lt;img src=x&gt;**'), /<img\b/i);
});

test("user messages keep typed double-star markers and explicit opt-out applies to shared content", () => {
  const content = "Soalan **000123**";
  const user = renderToStaticMarkup(createElement(AIMessage, { messageRole: "user", content }));
  const assistant = renderToStaticMarkup(createElement(AIMessage, { messageRole: "assistant", content, messageId: "message-000123" }));
  assert.deepEqual(strongText(user), []); assert.ok(user.includes(content));
  assert.deepEqual(strongText(render(content, false)), []);
  assert.deepEqual(strongText(assistant), ["000123"]);
  assert.match(assistant, /<div[^>]*class="ai-message-row ai-message-row-assistant"[^>]*data-ai-message-id="message-000123"/);
  assert.doesNotMatch(user, /data-ai-message-id/);
});
