/** SQR's username-or-email classifier, also used when editing a managed account. */
export function isCredentialEmail(value: string): boolean {
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1 || /\s/.test(value)) {
    return false;
  }

  // A separator needs at least one domain character on either side.
  const dot = value.indexOf(".", at + 2);
  return dot !== -1 && dot < value.length - 1;
}
