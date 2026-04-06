import type { RectLike } from "@/components/floating-ai-layout";

export const FLOATING_AI_AVOID_SELECTOR = "[data-floating-ai-avoid='true']";
export const FLOATING_AI_DIALOG_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";

const DENSE_PAGE_HINTS = [
  "analysis",
  "audit",
  "backup",
  "collection",
  "dashboard",
  "general-search",
  "monitor",
  "saved",
  "search",
  "settings",
  "viewer",
] as const;

export function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function resolveFloatingAiHasDensePage(activePage: string, location: string): boolean {
  const pageKey = `${activePage}:${location}`.toLowerCase();
  return DENSE_PAGE_HINTS.some((token) => pageKey.includes(token));
}

export function collectFloatingAiAvoidRects(): RectLike[] {
  return Array.from(document.querySelectorAll(FLOATING_AI_AVOID_SELECTOR))
    .filter((element) => isVisibleElement(element))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
}

export function hasFloatingAiBlockingDialog(): boolean {
  return Array.from(document.querySelectorAll(FLOATING_AI_DIALOG_SELECTOR)).some((element) =>
    isVisibleElement(element),
  );
}
