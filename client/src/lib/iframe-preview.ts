import type { IframeHTMLAttributes } from "react";

import { resolveSafePreviewSourceUrl } from "@/lib/safe-url";

export const DOCUMENT_PREVIEW_IFRAME_SANDBOX = "";
export const PDF_PREVIEW_IFRAME_SANDBOX = "allow-downloads allow-same-origin allow-scripts";
export const PREVIEW_IFRAME_REFERRER_POLICY: IframeHTMLAttributes<HTMLIFrameElement>["referrerPolicy"] =
  "no-referrer";

type ResolveSafeInlineIframePreviewUrlOptions = {
  baseUrl?: string | URL;
  allowBlob?: boolean;
};

export function resolveSafeInlineIframePreviewUrl(
  value: string | null | undefined,
  { baseUrl, allowBlob = false }: ResolveSafeInlineIframePreviewUrlOptions = {},
): string | null {
  const safeSource = resolveSafePreviewSourceUrl(
    value,
    baseUrl === undefined
      ? { allowBlob }
      : {
          allowBlob,
          baseUrl,
        },
  );

  if (!safeSource) {
    return null;
  }

  if (safeSource.startsWith("blob:") && !allowBlob) {
    return null;
  }

  return safeSource;
}

export function getSandboxedPreviewIframeProps(
  kind: "document" | "pdf",
): Pick<IframeHTMLAttributes<HTMLIFrameElement>, "referrerPolicy" | "sandbox"> {
  return {
    referrerPolicy: PREVIEW_IFRAME_REFERRER_POLICY,
    sandbox:
      kind === "pdf"
        ? PDF_PREVIEW_IFRAME_SANDBOX
        : DOCUMENT_PREVIEW_IFRAME_SANDBOX,
  };
}
