export function resolveAppRoot(documentRef: Pick<Document, "getElementById">) {
  const rootElement = documentRef.getElementById("root");
  if (!rootElement) {
    throw new Error('Unable to start the SQR app because the root element "#root" is missing.');
  }

  return rootElement;
}
