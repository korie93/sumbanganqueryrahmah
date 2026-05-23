import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAIMessageContentForDisplay } from "./ai-message-sanitizer";

test("sanitizeAIMessageContentForDisplay removes dangerous HTML while preserving plain text", () => {
  const sanitized = sanitizeAIMessageContentForDisplay(
    'Jumlah resit kekal 500 <script>alert("x")</script><svg onload="steal()"></svg> selesai',
  );

  assert.equal(sanitized.includes("<script"), false);
  assert.equal(sanitized.includes("<svg"), false);
  assert.equal(sanitized.includes("onload="), false);
  assert.match(sanitized, /Jumlah resit kekal 500/);
  assert.match(sanitized, /selesai/);
});

test("sanitizeAIMessageContentForDisplay removes event and javascript URL attributes", () => {
  const sanitized = sanitizeAIMessageContentForDisplay(
    '<a href="javascript:alert(1)" onclick="alert(2)">Semak rekod</a>',
  );

  assert.equal(sanitized.includes("javascript:"), false);
  assert.equal(sanitized.includes("onclick="), false);
  assert.match(sanitized, /Semak rekod/);
});

test("sanitizeAIMessageContentForDisplay preserves markdown and normal whitespace", () => {
  const sanitized = sanitizeAIMessageContentForDisplay("Senarai:\r\n- Satu\titem\n- Dua item");

  assert.equal(sanitized, "Senarai:\n- Satu\titem\n- Dua item");
});
