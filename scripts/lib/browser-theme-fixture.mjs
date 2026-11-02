/**
 * @typedef {Object} BrowserThemeFixtureOptions
 * @property {string} origin Exact isolated http://127.0.0.1:<port> origin.
 * @property {"fixed" | "preserve-choice" | "system"} mode
 * @property {"light" | "dark"} [theme]
 * @property {"light" | "dark"} [legacyTheme]
 * @property {"low" | "high" | "auto"} [performanceMode]
 * @property {"denied-getter" | "denied-read" | "quota-write"} [storageFailure]
 */

/**
 * Passed directly to Playwright addInitScript. Keep this callback self-contained:
 * it runs in each browser document, not in the Node module's lexical scope.
 * Fixed visual tests deliberately reset the palette; journey tests seed once;
 * OS tests clear explicit preferences once, then allow real choices to persist.
 * @param {BrowserThemeFixtureOptions} options
 */
export function initializeBrowserThemeFixture(options) {
  const origin = new URL(options.origin);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port
    || origin.origin !== options.origin) throw new Error("Theme fixtures require an exact isolated loopback origin");
  if (!["fixed", "preserve-choice", "system"].includes(options.mode)) throw new Error("Select an explicit theme fixture mode");
  if (options.theme !== undefined && !["light", "dark"].includes(options.theme)) throw new Error("Invalid fixture theme");
  if (options.legacyTheme !== undefined && !["light", "dark"].includes(options.legacyTheme)) throw new Error("Invalid legacy fixture theme");
  if (options.performanceMode !== undefined && !["low", "high", "auto"].includes(options.performanceMode)) throw new Error("Invalid fixture performance mode");
  if (options.storageFailure !== undefined && !["denied-getter", "denied-read", "quota-write"].includes(options.storageFailure)) throw new Error("Invalid fixture storage failure");
  // This callback also runs in about:blank and foreign documents. Never inspect
  // their storage, including when an opaque origin's getter would throw.
  if (location.origin !== options.origin) return;

  if (options.performanceMode === "auto") localStorage.removeItem("perf_mode");
  else if (options.performanceMode) localStorage.setItem("perf_mode", options.performanceMode);

  const marker = `sqr:test:browser-theme:${options.mode}`;
  const firstDocument = options.mode === "fixed" || localStorage.getItem(marker) !== "1";
  if (firstDocument) {
    if (options.mode === "system") {
      localStorage.removeItem("theme");
      localStorage.removeItem("sqr-landing-next-theme");
    } else {
      if (options.mode === "fixed" || localStorage.getItem("theme") === null) {
        localStorage.setItem("theme", options.theme ?? "light");
      }
      if (options.legacyTheme) localStorage.setItem("sqr-landing-next-theme", options.legacyTheme);
    }
    if (options.mode !== "fixed") localStorage.setItem(marker, "1");
  }

  // Seed and fault injection share one callback so Playwright init-script
  // ordering cannot cause the fixture itself to fail before the app starts.
  if (options.storageFailure === "denied-getter") {
    Object.defineProperty(window, "localStorage", { configurable: true, get() {
      throw new DOMException("Synthetic storage access denied", "SecurityError");
    } });
  } else if (options.storageFailure === "denied-read") {
    const originalGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "theme") throw new DOMException("Synthetic storage read denied", "SecurityError");
      return originalGet.call(this, key);
    };
  } else if (options.storageFailure === "quota-write") {
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "theme") throw new DOMException("Synthetic storage quota reached", "QuotaExceededError");
      return originalSet.call(this, key, value);
    };
  }
}
