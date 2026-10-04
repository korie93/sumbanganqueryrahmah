import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { twMerge } from "tailwind-merge";

// Exercise real built CSS and the actual primitive class lists without a backend,
// account fixture, source-code CSS compiler or snapshot baseline update.
const repoFile = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url));
const source = (name: string) => readFileSync(repoFile(name), "utf8");

function builtStyles() {
  const directory = repoFile("dist-local/public/assets/");
  const files = readdirSync(directory);
  return ["index", "AuthenticatedAppEntry"].map((entry) => {
    const matches = files.filter((file) => file.startsWith(`${entry}-`) && file.endsWith(".css"));
    expect(matches, `Exactly one current built ${entry} CSS asset is required`).toHaveLength(1);
    return readFileSync(`${directory}/${matches[0]}`, "utf8");
  }).join("\n");
}

async function loadFixture(page: Page) {
  await page.route("**/*", (route) => route.abort());
  await page.setContent("<!doctype html><html><head></head><body></body></html>");
  await page.addStyleTag({ content: builtStyles() });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
}

test.describe("Tailwind v4 compatibility with real motion", () => {
  test.use({ reducedMotion: "no-preference", viewport: { width: 1280, height: 900 } });

  for (const component of ["dialog", "alert-dialog"]) {
    test(`${component} stays centered throughout opening and closing`, async ({ page }) => {
      await loadFixture(page);
      const template = source(`client/src/components/ui/${component}.tsx`).match(/`(fixed left-\[50%\][^`]+)`/)?.[1];
      expect(template, "Read the real primitive content class list").toBeTruthy();
      // This interpolation only supplies max-height. Preserve all actual motion,
      // transform, positioning and duration classes from the component itself.
      const classes = template!.replace(/\$\{viewportSafeDialogMaxHeightClassName\}/g, "");
      expect(classes).not.toContain("${");
      await page.evaluate((className) => {
        const modal = document.createElement("section");
        modal.id = "motion-modal";
        modal.className = className;
        modal.style.width = "400px";
        modal.style.height = "240px";
        modal.textContent = "Motion compatibility fixture";
        document.body.append(modal);
      }, classes);
      const modal = page.locator("#motion-modal");
      const resting = await modal.boundingBox();
      expect(resting).not.toBeNull();
      expect(resting!.x + resting!.width / 2).toBeCloseTo(640, 1);
      expect(resting!.y + resting!.height / 2).toBeCloseTo(450, 1);

      for (const state of ["open", "closed"] as const) {
        const frames = await modal.evaluate((element, nextState) => {
          element.setAttribute("data-state", nextState);
          const animation = element.getAnimations().find((item) => item instanceof CSSAnimation
            && item.animationName === (nextState === "open" ? "enter" : "exit"));
          if (!animation?.effect) throw new Error(`Missing real ${nextState} CSS animation`);
          animation.pause();
          const duration = animation.effect.getTiming().duration;
          if (typeof duration !== "number" || duration < 50 || duration > 1000) {
            throw new Error(`Unexpected real animation duration: ${duration}`);
          }
          // Stop just before completion: exit has no forwards fill and Radix
          // unmounts at the end, so sampling exactly 1 would read resting CSS.
          return [0, 0.25, 0.5, 0.75, 0.9999].map((fraction) => {
            animation.currentTime = duration * fraction;
            const rect = element.getBoundingClientRect();
            return {
              fraction, width: rect.width, height: rect.height,
              centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2,
              translate: getComputedStyle(element).translate,
            };
          });
        }, state);

        for (const frame of frames) {
          expect(frame.translate, `${state} ${frame.fraction}: no additive translate`).toBe("none");
          expect(frame.centerX, `${state} ${frame.fraction}: keep horizontal center`).toBeCloseTo(640, 1);
          // The existing -48% enter/exit offset produces a 2%-height rise, not
          // an additional half-dialog jump caused by individual translate.
          expect(frame.centerY).toBeGreaterThanOrEqual(449.9);
          expect(frame.centerY).toBeLessThanOrEqual(450 + resting!.height * 0.02 + 0.1);
        }
        const scaled = state === "open" ? frames[0] : frames.at(-1)!;
        const full = state === "open" ? frames.at(-1)! : frames[0];
        expect(scaled.width).toBeCloseTo(resting!.width * 0.95, 1);
        expect(scaled.height).toBeCloseTo(resting!.height * 0.95, 1);
        expect(full.width).toBeCloseTo(resting!.width, 1);
        expect(full.height).toBeCloseTo(resting!.height, 1);
      }
    });
  }

  test("uncolored ToastClose focus ring retains the v3 blue at half opacity", async ({ page }) => {
    await loadFixture(page);
    const classes = source("client/src/components/ui/toast.tsx")
      .match(/"(absolute right-2 top-2 [^"]*focus:ring-2[^"]*)"/)?.[1];
    expect(classes, "Read actual ToastClose classes").toBeTruthy();
    await page.evaluate((className) => {
      const button = document.createElement("button");
      button.id = "toast-close";
      button.className = className;
      button.textContent = "Close";
      document.body.append(button);
    }, classes!);
    const close = page.locator("#toast-close");
    await close.focus();
    const shadow = await close.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(shadow).toMatch(/rgba\(59,\s*130,\s*246,\s*0\.5\)/);
  });

  test("mobile fullscreen dialog overrides centering without a leftover transform", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadFixture(page);
    const base = source("client/src/components/ui/dialog.tsx").match(/`(fixed left-\[50%\][^`]+)`/)![1].replace(/\$\{[^}]+\}/g, "");
    const override = source("client/src/pages/general-search/GeneralSearchRecordDialog.tsx")
      .match(/`\$\{mobileFullscreenDialogViewportClassName\}([^`]+)`/)![1];
    await page.evaluate((className) => {
      const modal = document.createElement("section");
      modal.id = "fullscreen";
      modal.className = className;
      modal.style.height = "100dvh";
      document.body.append(modal);
    }, twMerge(base, override));
    const rect = await page.locator("#fullscreen").boundingBox();
    expect(rect).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  });

  test("select offsets and toast swipes do not add to plugin animation transforms", async ({ page }) => {
    await loadFixture(page);
    const select = source("client/src/components/ui/select.tsx");
    const selectClasses = [select.match(/"(relative z-\[var\(--z-popover\)\][^"]+)"/)![1],
      select.match(/"(data-\[side=bottom\]:\[transform:[^"]+)"/)![1]].join(" ");
    const toastClasses = source("client/src/components/ui/toast.tsx")
      .match(/"(group pointer-events-auto relative [^"]+)"/)![1];
    const states = await page.evaluate(({ selectClasses, toastClasses }) => {
      const select = document.createElement("div");
      select.className = selectClasses;
      select.dataset.side = "bottom";
      select.dataset.state = "open";
      document.body.append(select);
      const enter = select.getAnimations().find(a => a instanceof CSSAnimation && a.animationName === "enter")!;
      enter.pause(); enter.currentTime = 0;
      const selectStyle = getComputedStyle(select);
      const selectResult = { translate: selectStyle.translate, y: new DOMMatrix(selectStyle.transform).m42 };
      const toast = document.createElement("div");
      toast.className = toastClasses;
      toast.style.cssText = "width:200px;--radix-toast-swipe-end-x:80px";
      toast.dataset.swipe = "end";
      toast.dataset.state = "closed";
      document.body.append(toast);
      const exit = toast.getAnimations().find(a => a instanceof CSSAnimation && a.animationName === "exit")!;
      exit.pause(); exit.currentTime = Number(exit.effect!.getTiming().duration) * 0.9999;
      const toastStyle = getComputedStyle(toast);
      return { select: selectResult, toast: { translate: toastStyle.translate, x: new DOMMatrix(toastStyle.transform).m41 } };
    }, { selectClasses, toastClasses });
    expect(states.select.translate).toBe("none");
    expect(states.select.y, JSON.stringify(states)).toBeCloseTo(-8, 1);
    expect(states.toast.translate).toBe("none");
    expect(states.toast.x).toBeCloseTo(200, 1);
  });

  test("legacy password toggle stays centered when login CSS also supplies a transform", async ({ page }) => {
    await loadFixture(page);
    await page.addStyleTag({ content: source("client/src/pages/Login.css") });
    const classes = source("client/src/pages/LoginParts.tsx").match(/"(login-password-toggle absolute [^"]+)"/)![1];
    await page.evaluate((className) => {
      const parent = document.createElement("div");
      parent.className = "auth-v17";
      parent.style.cssText = "position:relative;width:300px;height:60px;";
      const button = document.createElement("button");
      button.id = "legacy-toggle";
      button.className = className;
      parent.append(button);
      document.body.append(parent);
    }, classes);
    expect(await page.locator("#legacy-toggle").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return Math.abs(rect.y + rect.height / 2 - parent.y - parent.height / 2);
    })).toBeLessThan(0.1);
  });
});
