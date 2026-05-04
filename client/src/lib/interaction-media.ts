type PublicAuthAutofocusWindow = Pick<Window, "matchMedia">;

export function shouldAutoFocusPublicAuthField(
  viewportWindow: PublicAuthAutofocusWindow | undefined =
    typeof window !== "undefined" ? window : undefined,
): boolean {
  if (!viewportWindow || typeof viewportWindow.matchMedia !== "function") {
    return false;
  }

  try {
    return (
      viewportWindow.matchMedia("(pointer: fine)").matches
      && viewportWindow.matchMedia("(hover: hover)").matches
    );
  } catch {
    return false;
  }
}
