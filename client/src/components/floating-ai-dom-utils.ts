import type { RectLike } from "@/components/floating-ai-layout";

export const FLOATING_AI_AVOID_SELECTOR = "[data-floating-ai-avoid='true']";
export const FLOATING_AI_DIALOG_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";
export const FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR =
  ".save-collection-workspace :is(input:not([type='hidden']), textarea, select, button, summary, [role='combobox']), .collection-save-nickname-controls :is(button, [role='combobox'])";
export const FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR = ".save-collection-workspace, .collection-save-nickname-controls";

export type FloatingAiObstacleQueryResult = {
  avoidElements: Element[];
  dialogElements: Element[];
  observedElements: Element[];
};

export type FloatingAiDomSnapshot = {
  avoidRects: RectLike[];
  hasBlockingDialog: boolean;
};

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

function isFloatingAiOwnedDialog(element: Element | null): boolean {
  if (!element || typeof (element as { getAttribute?: unknown }).getAttribute !== "function") {
    return false;
  }

  return (element as { getAttribute(name: string): string | null }).getAttribute("data-floating-ai-dialog") === "true";
}

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

export function queryFloatingAiObstacleElements(
  documentObject: Document = document,
  includeSaveCollectionControls = false,
  includeSavedLayout = false,
): FloatingAiObstacleQueryResult {
  const avoidSelector = [
    FLOATING_AI_AVOID_SELECTOR,
    ...(includeSaveCollectionControls ? [FLOATING_AI_SAVE_COLLECTION_CONTROL_SELECTOR] : []),
    ...(includeSavedLayout ? ["[data-saved-ai-avoid='true']"] : []),
  ].join(", ");
  const avoidElements = Array.from(documentObject.querySelectorAll(avoidSelector));
  const dialogElements = Array.from(documentObject.querySelectorAll(FLOATING_AI_DIALOG_SELECTOR));
  const layoutSelectors = [
    ...(includeSaveCollectionControls ? [FLOATING_AI_SAVE_COLLECTION_LAYOUT_SELECTOR] : []),
    ...(includeSavedLayout ? [".saved-workspace"] : []),
  ];
  const layoutElements = layoutSelectors.length > 0
    ? Array.from(documentObject.querySelectorAll(layoutSelectors.join(", ")))
    : [];

  return {
    avoidElements,
    dialogElements,
    observedElements: [...new Set([...avoidElements, ...dialogElements, ...layoutElements])],
  };
}

export function collectFloatingAiAvoidRects(elements?: Iterable<Element>): RectLike[] {
  return Array.from(elements ?? document.querySelectorAll(FLOATING_AI_AVOID_SELECTOR))
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

export function hasFloatingAiBlockingDialog(elements?: Iterable<Element>): boolean {
  return Array.from(elements ?? document.querySelectorAll(FLOATING_AI_DIALOG_SELECTOR)).some((element) =>
    !isFloatingAiOwnedDialog(element) && isVisibleElement(element),
  );
}

export function collectFloatingAiDomSnapshot(
  obstacleQuery: FloatingAiObstacleQueryResult = queryFloatingAiObstacleElements(),
): FloatingAiDomSnapshot {
  return {
    avoidRects: collectFloatingAiAvoidRects(obstacleQuery.avoidElements),
    hasBlockingDialog: hasFloatingAiBlockingDialog(obstacleQuery.dialogElements),
  };
}
