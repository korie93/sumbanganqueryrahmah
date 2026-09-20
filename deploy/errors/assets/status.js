/* Manual recovery only. No polling, third-party code, form replay or URL echo. */
(() => {
  "use strict";
  const root = document.querySelector("[data-recovery-copy]");
  const action = root?.querySelector("[data-status-primary]");
  if (!root || !action) return;
  let copy;
  try { copy = JSON.parse(root.dataset.recoveryCopy); } catch { return; }
  try {
    const theme = localStorage.getItem("theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch { /* Storage is optional; CSS honors system theme. */ }
  const initialState = root.dataset.state;
  const feedback = root.querySelector("[data-status-feedback]");
  let controller = null;
  let nextAllowed = 0;
  const setText = (selector, text) => { const node = root.querySelector(selector); if (node) node.textContent = text; };
  function show(state) {
    const content = copy[state];
    if (!content) return;
    root.dataset.state = state;
    root.dataset.tone = content.tone;
    for (const field of ["label", "title", "description", "guidance", "note"]) setText(`[data-status-${field}]`, content[field]);
    content.steps.forEach((step, index) => setText(`[data-status-step="${index}"]`, step));
    setText("[data-status-code]", content.code ? `Kod: ${content.code}` : "Status sambungan");
    root.querySelectorAll("[data-status-icon]").forEach((icon) => {
      const variant = state === "offline" || state === "restored" || (state === "maintenance" && initialState !== "maintenance") ? state : "initial";
      icon.hidden = icon.dataset.statusIcon !== variant;
    });
    setText("[data-status-primary] span", state === "restored" ? "Sambung ke SQR" : "Cuba Semula");
    const secondary = root.querySelector("[data-status-secondary]");
    if (secondary) secondary.hidden = state !== "maintenance";
    document.title = `SQR — ${content.title}`;
  }
  function busy(value) { action.setAttribute("aria-busy", String(value)); action.setAttribute("aria-disabled", String(value)); }
  async function json(url, signal) {
    const response = await fetch(url, { signal, cache: "no-store", credentials: "same-origin", redirect: "error", headers: { Accept: "application/json" } });
    if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) throw new Error("unavailable");
    // Cap the stream before parsing: this standalone page has no application JSON reader.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("unavailable");
    let raw = "";
    let size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16384) { await reader.cancel(); throw new Error("unavailable"); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      return JSON.parse(raw + decoder.decode());
    } finally { reader.releaseLock(); }
  }
  action.addEventListener("click", async (event) => {
    if (root.dataset.state === "restored") return; // Safe GET /, never replay a POST or query string.
    event.preventDefault();
    if (controller || document.hidden) return;
    if (Date.now() < nextAllowed) { feedback.textContent = "Tunggu sebentar sebelum menyemak semula."; return; }
    nextAllowed = Date.now() + 3000;
    if (navigator.onLine === false) { show("offline"); feedback.textContent = "Semak sambungan rangkaian peranti anda."; return; }
    const active = new AbortController();
    controller = active;
    const timeout = setTimeout(() => active.abort(), 8000);
    busy(true);
    setText("[data-status-primary] span", "Menyemak sambungan…");
    feedback.textContent = "Menyemak sambungan…";
    try {
      const health = await json("/api/health/live", active.signal);
      if (health?.ready !== true) throw new Error("unavailable");
      const maintenance = await json("/api/maintenance-status", active.signal);
      active.signal.throwIfAborted();
      if (maintenance?.maintenance === false) { show("restored"); feedback.textContent = "Sambungan disahkan. Anda boleh sambung ke SQR."; }
      else if (maintenance?.maintenance === true) { show("maintenance"); feedback.textContent = "Penyelenggaraan masih aktif. Sila cuba semula kemudian."; }
      else throw new Error("unavailable");
    } catch {
      show(navigator.onLine === false ? "offline" : initialState);
      feedback.textContent = document.hidden ? "Semakan dijeda. Cuba semula apabila anda bersedia."
        : "Perkhidmatan belum dapat disahkan. Sila cuba semula sebentar lagi.";
    } finally {
      clearTimeout(timeout);
      if (controller === active) controller = null;
      busy(false);
    }
  });
  window.addEventListener("offline", () => { controller?.abort(); show("offline"); feedback.textContent = "Semak sambungan rangkaian peranti anda."; });
  window.addEventListener("online", () => { feedback.textContent = "Rangkaian dikesan. Tekan Cuba Semula untuk mengesahkan perkhidmatan."; });
  document.addEventListener("visibilitychange", () => { if (document.hidden) controller?.abort(); });
  window.addEventListener("pagehide", () => controller?.abort());
  if (navigator.onLine === false) show("offline");
})();
