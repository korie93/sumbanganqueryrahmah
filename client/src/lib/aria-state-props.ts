type AriaBooleanString = "true" | "false";

export function getAriaCurrentPageProps(active: boolean): { "aria-current"?: "page" } {
  return active ? { "aria-current": "page" } : {};
}

export function getAriaCurrentStepProps(active: boolean): { "aria-current"?: "step" } {
  return active ? { "aria-current": "step" } : {};
}

export function getAriaExpandedProps(expanded: boolean): { "aria-expanded": AriaBooleanString } {
  return { "aria-expanded": expanded ? "true" : "false" };
}

export function getAriaRequiredProps(required: boolean): { "aria-required": AriaBooleanString } {
  return { "aria-required": required ? "true" : "false" };
}

export function getAriaSelectedProps(selected: boolean): { "aria-selected": AriaBooleanString } {
  return { "aria-selected": selected ? "true" : "false" };
}
