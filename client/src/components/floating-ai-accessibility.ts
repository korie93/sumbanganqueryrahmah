type FloatingAiSiblingElement = {
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  setAttribute(name: string, value: string): void;
  toggleAttribute(name: string, force?: boolean): boolean;
};

type FloatingAiParentElement = {
  children: ArrayLike<FloatingAiSiblingElement>;
};

type FloatingAiIsolationRootElement = FloatingAiSiblingElement & {
  parentElement: FloatingAiParentElement | null;
};

type FloatingAiIsolationSnapshot = {
  element: FloatingAiSiblingElement;
  hadInert: boolean;
  ariaHidden: string | null;
};

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
