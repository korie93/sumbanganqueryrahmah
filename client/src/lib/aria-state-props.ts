type AriaBooleanString = "true" | "false";
type AriaInvalidInput = boolean | "true" | "false" | "grammar" | "spelling" | null | undefined;
type AriaInvalidToken = "true" | "grammar" | "spelling";

export function getAriaCurrentPageProps(active: boolean): { "aria-current"?: "page" } {
  return active ? { "aria-current": "page" } : {};
}

export function getAriaCurrentStepProps(active: boolean): { "aria-current"?: "step" } {
  return active ? { "aria-current": "step" } : {};
}

export function getAriaExpandedProps(expanded: boolean): { "aria-expanded": AriaBooleanString } {
  return { "aria-expanded": expanded ? "true" : "false" };
}

export function getAriaInvalidProps(invalid: AriaInvalidInput): { "aria-invalid"?: AriaInvalidToken } {
  if (invalid === true || invalid === "true") {
    return { "aria-invalid": "true" };
  }
  if (invalid === "grammar" || invalid === "spelling") {
    return { "aria-invalid": invalid };
  }
  return {};
}

export function getAriaRequiredProps(required: boolean): { "aria-required"?: "true" } {
  return required ? { "aria-required": "true" } : {};
}

export function getAriaSelectedProps(selected: boolean): { "aria-selected": AriaBooleanString } {
  return { "aria-selected": selected ? "true" : "false" };
}
