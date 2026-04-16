import type { ReactNode } from "react";

type ToastLike = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive" | null | undefined;
};

function flattenReactNodeText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => flattenReactNodeText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return "";
}

export function buildToastAnnouncement(toast: ToastLike): string {
  return [flattenReactNodeText(toast.title), flattenReactNodeText(toast.description)]
    .filter(Boolean)
    .join(". ")
    .trim();
}

export function resolveToastAnnouncementPriority(toast: ToastLike): "polite" | "assertive" {
  return toast.variant === "destructive" ? "assertive" : "polite";
}
