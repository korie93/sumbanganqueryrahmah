type FloatingAiSiblingElement = {
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  toggleAttribute(name: string, force?: boolean): boolean;
};

type FloatingAiParentElement = {
  children: ArrayLike<FloatingAiSiblingElement>;
};

type FloatingAiFocusableElement = {
  focus(): void;
  getAttribute(name: string): string | null;
};

type FloatingAiDialogElement = FloatingAiSiblingElement & {
  contains(target: unknown): boolean;
  focus(): void;
  querySelectorAll(selector: string): ArrayLike<FloatingAiFocusableElement>;
};

type FloatingAiIsolationRootElement = FloatingAiSiblingElement & {
  parentElement: FloatingAiParentElement | null;
};

type FloatingAiDocumentLike = {
  activeElement: unknown;
  addEventListener(type: "focusin" | "keydown", listener: (...args: unknown[]) => void, options?: boolean): void;
  removeEventListener(type: "focusin" | "keydown", listener: (...args: unknown[]) => void, options?: boolean): void;
};

type FloatingAiIsolationSnapshot = {
  element: FloatingAiSiblingElement;
  hadInert: boolean;
  ariaHidden: string | null;
};

type FloatingAiModalAccessibilityParams = {
  rootElement: FloatingAiIsolationRootElement;
  dialogElement: FloatingAiDialogElement;
  documentObject?: FloatingAiDocumentLike;
};

type FloatingAiKeydownLike = {
  key?: string;
  shiftKey?: boolean;
  preventDefault(): void;
};

const FLOATING_AI_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function isTrapFocusableElement(element: FloatingAiFocusableElement): boolean {
  if (element.getAttribute("disabled") !== null) {
    return false;
  }

  if (element.getAttribute("hidden") !== null) {
    return false;
  }

  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  return element.getAttribute("tabindex") !== "-1";
}

function listFloatingAiFocusableElements(
  dialogElement: FloatingAiDialogElement,
): FloatingAiFocusableElement[] {
  return Array.from(dialogElement.querySelectorAll(FLOATING_AI_FOCUSABLE_SELECTOR)).filter(
    isTrapFocusableElement,
  );
}

function focusFloatingAiDialogElement(
  dialogElement: FloatingAiDialogElement,
  preferLast = false,
): void {
  const focusableElements = listFloatingAiFocusableElements(dialogElement);
  const target = preferLast
    ? focusableElements[focusableElements.length - 1]
    : focusableElements[0];

  (target ?? dialogElement).focus();
}

export function applyFloatingAiModalIsolation(rootElement: FloatingAiIsolationRootElement) {
  const parentElement = rootElement.parentElement;
  if (!parentElement) {
    return () => {};
  }

  const siblingSnapshots: FloatingAiIsolationSnapshot[] = Array.from(parentElement.children)
    .filter((element) => element !== rootElement)
    .map((element) => ({
      element,
      hadInert: element.getAttribute("inert") !== null,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

  for (const { element } of siblingSnapshots) {
    element.setAttribute("aria-hidden", "true");
    element.toggleAttribute("inert", true);
  }

  let restored = false;

  return () => {
    if (restored) {
      return;
    }
    restored = true;

    for (const { element, hadInert, ariaHidden } of siblingSnapshots) {
      if (ariaHidden == null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", ariaHidden);
      }

      if (hadInert) {
        element.toggleAttribute("inert", true);
      } else {
        element.removeAttribute("inert");
      }
    }
  };
}

export function trapFloatingAiDialogFocus(
  dialogElement: FloatingAiDialogElement,
  documentObject: FloatingAiDocumentLike = document,
) {
  const previousActiveElement = documentObject.activeElement as { focus?: (() => void) | undefined } | null;

  focusFloatingAiDialogElement(dialogElement);

  const handleKeyDown = (eventLike: unknown) => {
    const event = eventLike as FloatingAiKeydownLike;
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = listFloatingAiFocusableElements(dialogElement);
    const activeElement = documentObject.activeElement;

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeInsideDialog = dialogElement.contains(activeElement);

    if (event.shiftKey) {
      if (!activeInsideDialog || activeElement === firstElement || activeElement === dialogElement) {
        event.preventDefault();
        focusFloatingAiDialogElement(dialogElement, true);
      }
      return;
    }

    if (!activeInsideDialog || activeElement === lastElement) {
      event.preventDefault();
      focusFloatingAiDialogElement(dialogElement);
    }
  };

  const handleFocusIn = () => {
    const activeElement = documentObject.activeElement;
    if (activeElement && !dialogElement.contains(activeElement)) {
      focusFloatingAiDialogElement(dialogElement);
    }
  };

  documentObject.addEventListener("keydown", handleKeyDown, true);
  documentObject.addEventListener("focusin", handleFocusIn, true);

  let restored = false;

  return () => {
    if (restored) {
      return;
    }
    restored = true;

    documentObject.removeEventListener("keydown", handleKeyDown, true);
    documentObject.removeEventListener("focusin", handleFocusIn, true);
    previousActiveElement?.focus?.();
  };
}

export function applyFloatingAiModalAccessibility({
  rootElement,
  dialogElement,
  documentObject = document,
}: FloatingAiModalAccessibilityParams) {
  const restoreIsolation = applyFloatingAiModalIsolation(rootElement);
  const restoreFocusTrap = trapFloatingAiDialogFocus(dialogElement, documentObject);

  return () => {
    restoreIsolation();
    restoreFocusTrap();
  };
}
