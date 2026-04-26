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

type PdfPreviewIframePropsOptions = {
  trustedBlobSource?: boolean;
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

export function isBlobPreviewSourceUrl(value: string | null | undefined): boolean {
  return String(value || "").trim().toLowerCase().startsWith("blob:");
}

export function getPdfPreviewIframeProps(
  source: string | null | undefined,
  { trustedBlobSource = false }: PdfPreviewIframePropsOptions = {},
): Pick<IframeHTMLAttributes<HTMLIFrameElement>, "referrerPolicy"> &
  Partial<Pick<IframeHTMLAttributes<HTMLIFrameElement>, "sandbox">> {
  if (trustedBlobSource && isBlobPreviewSourceUrl(source)) {
    // Chrome's PDF viewer may block sandboxed blob PDFs. This path is limited
    // to same-origin blob URLs created from authenticated receipt API responses.
    return {
      referrerPolicy: PREVIEW_IFRAME_REFERRER_POLICY,
    };
  }

  return getSandboxedPreviewIframeProps("pdf");
}
