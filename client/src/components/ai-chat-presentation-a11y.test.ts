import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AIChatStatusAnnouncement, getAIChatStatusAnnouncement } from "./AIChatStatusAnnouncement";
import { AIIconTooltip, AIIconTooltipButton } from "./AIIconTooltip";
import { Button } from "./ui/button";

const idle = { enabled: true, status: "IDLE" as const, gateNotice: null, slowNotice: false, retryAvailable: false };

test("AI status starts quiet and exposes one persistent named polite live region", () => {
  const markup = renderToStaticMarkup(createElement(AIChatStatusAnnouncement, idle));
  assert.equal(getAIChatStatusAnnouncement(idle), "");
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Status AI SQR"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-atomic="true"/);
  assert.equal((markup.match(/role="status"/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /AI idle|role="alert"/);
});

test("AI status prioritizes restrictions and manual recovery over stale progress", () => {
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "SEARCHING", slowNotice: true, gateNotice: "Permintaan menunggu giliran.", retryAvailable: true }), "Permintaan menunggu giliran.");
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "SEARCHING", slowNotice: true, retryAvailable: true }), "Permintaan AI gagal. Cuba semula soalan terakhir tersedia.");
  assert.equal(getAIChatStatusAnnouncement({ ...idle, enabled: false, retryAvailable: true, gateNotice: "Giliran" }), "");
});

test("AI announcements are short phase changes rather than generated answer fragments", () => {
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "SEARCHING" }), "AI sedang mencari maklumat...");
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "PROCESSING" }), "AI sedang memproses data...");
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "TYPING", slowNotice: true }), "AI sedang menaip jawapan...");
  assert.equal(getAIChatStatusAnnouncement({ ...idle, status: "PROCESSING", slowNotice: true }), "Jawapan mengambil masa lebih lama daripada biasa. Sistem masih memproses data.");
  const markup = renderToStaticMarkup(createElement(AIChatStatusAnnouncement, { ...idle, gateNotice: '<script>restricted</script>' }));
  assert.ok(markup.includes("&lt;script&gt;restricted&lt;/script&gt;"));
  assert.doesNotMatch(markup, /<script\b/);
});

test("icon tooltip keeps one accessible button and no extra visible label or layout wrapper", () => {
  const markup = renderToStaticMarkup(createElement(AIIconTooltip, {
    label: "Ke mesej terkini",
    children: createElement(Button, { type: "button", "aria-label": "Ke mesej terkini" }),
  }));
  assert.equal((markup.match(/<button\b/g) ?? []).length, 1);
  assert.match(markup, /aria-label="Ke mesej terkini"/);
  assert.match(markup, /data-state="closed"/);
  assert.doesNotMatch(markup, /<div\b|title=|>Ke mesej terkini</);
});

test("launcher tooltip preserves its existing status description while adding the open tooltip id", () => {
  const render = (persistentDescriptionId?: string, tooltipDescriptionId?: string) => renderToStaticMarkup(createElement(AIIconTooltipButton, {
    persistentDescriptionId,
    "aria-describedby": tooltipDescriptionId,
    "aria-label": "Buka panel AI SQR",
    "aria-controls": "ai-panel",
    "aria-expanded": false,
    type: "button",
  }));
  assert.match(render("status-hint", "tooltip-hint"), /aria-describedby="status-hint tooltip-hint"/);
  assert.match(render("status-hint"), /aria-describedby="status-hint"/);
  assert.match(render(undefined, "tooltip-hint"), /aria-describedby="tooltip-hint"/);
  assert.match(render("same-id", "same-id"), /aria-describedby="same-id"/);
  assert.doesNotMatch(render(), /aria-describedby=/);
  assert.match(render("status-hint", "tooltip-hint"), /aria-controls="ai-panel"/);
  assert.match(render("status-hint", "tooltip-hint"), /aria-expanded="false"/);
  assert.equal((render("status-hint", "tooltip-hint").match(/<button\b/g) ?? []).length, 1);
});
