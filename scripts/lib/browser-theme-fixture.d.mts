export type BrowserThemeFixtureOptions = {
  origin: string;
  mode: "fixed" | "preserve-choice" | "system";
  theme?: "light" | "dark";
  legacyTheme?: "light" | "dark";
  performanceMode?: "low" | "high" | "auto";
  storageFailure?: "denied-getter" | "denied-read" | "quota-write";
};

/** Self-contained callback serialized by Playwright into each fixture document. */
export function initializeBrowserThemeFixture(options: BrowserThemeFixtureOptions): void;
